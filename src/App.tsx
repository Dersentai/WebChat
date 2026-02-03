import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Info, Paperclip, Send, X, Check } from 'lucide-react'
import { projectId, publicAnonKey } from './utils/supabase/info'

interface Message {
  id: string
  username: string
  text: string
  timestamp: number
  replyTo?: string | null
  fileUrl?: string | null
  fileType?: string | null
  fileName?: string | null
}

interface Settings {
  backgroundImage: string | null
  panelColor: string
  iconColor: string
  panelOpacity: number
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('гость')
  const [inputText, setInputText] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [showSetBg, setShowSetBg] = useState(false)
  const [showSetTheme, setShowSetTheme] = useState(false)
  const [showFilePreview, setShowFilePreview] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ url: string, type: string, name: string } | null>(null)
  const [previewText, setPreviewText] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
// --- Добавлено: карта последних активностей для определения онлайн/оффлайн (хак/эвристика) ---
const [lastActiveMap, setLastActiveMap] = useState<Record<string, number>>({})
const ONLINE_THRESHOLD_MS = 1000 * 60 * 2 // 2 минуты: если пользователь писал в течение 2 минут — считаем онлайн
const isUserOnline = (username: string) => {
  const t = lastActiveMap[username]
  if (!t) return false
  return Date.now() - t < ONLINE_THRESHOLD_MS
}
// --- конец добавления ---
  const [viewCount, setViewCount] = useState(0)
  const [settings, setSettings] = useState<Settings>({
    backgroundImage: null,
    panelColor: '#1a1a1a',
    iconColor: '#64b5f6',
    panelOpacity: 0.85
  })
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set())
  const [bgUrl, setBgUrl] = useState('')
  const [themePanel, setThemePanel] = useState('#1a1a1a')
  const [themeIcon, setThemeIcon] = useState('#64b5f6')
  const [themeOpacity, setThemeOpacity] = useState(0.85)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  // Persist userId across page reloads so one browser == one unique id
// Persist userId across page reloads so one browser == one unique id
const userId = useRef<string>(
  localStorage.getItem('chatUserId') ||
  (() => {
    const id = Math.random().toString(36).substring(2, 12)
    localStorage.setItem('chatUserId', id)
    return id
  })()
)

// Persist "hasVisited" flag so refresh doesn't count as a new visit
const hasVisited = useRef<boolean>(localStorage.getItem('chatHasVisited') === 'true')

const presenceInitialized = useRef(false)

const VIEW_CLAIM_KEY = 'chatViewClaim'
const VIEW_COUNTED_KEY = 'chatViewCounted'

  const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-98c5d13a`

const tryClaimView = (): boolean => {
  try {
    if (localStorage.getItem(VIEW_COUNTED_KEY) === 'true') return false
    localStorage.setItem(VIEW_CLAIM_KEY, userId.current)
    return localStorage.getItem(VIEW_CLAIM_KEY) === userId.current
  } catch (e) {
    return false
  }
}

const markViewCounted = (): void => {
  try {
    localStorage.setItem(VIEW_COUNTED_KEY, 'true')
    localStorage.removeItem(VIEW_CLAIM_KEY)
  } catch (e) {}
}

  // Load username from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chatUsername')
    if (saved) {
      setDisplayName(saved)
    }
  }, [])

  // Fetch messages
  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API_URL}/messages`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      })
      const data = await res.json()
      if (data.success) {
  setMessages(data.messages)
  // --- Добавлено: обновляем карту lastActiveMap на основе timestamp сообщений ---
  const _map: Record<string, number> = {}
  data.messages.forEach((m: any) => {
    if (!m || !m.username) return
    const t = m.timestamp || Date.now()
    _map[m.username] = Math.max(_map[m.username] || 0, t)
  })
  setLastActiveMap(prev => ({ ...prev, ..._map }))
  // --- конец добавления ---
}
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }

  // Fetch settings
  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` }
      })
      const data = await res.json()
      if (data.success) {
        setSettings(data.settings)
        setThemePanel(data.settings.panelColor)
        setThemeIcon(data.settings.iconColor)
        setThemeOpacity(data.settings.panelOpacity)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    }
  }

  // Update presence and fetch stats
const updatePresence = async () => {
  try {
    const alreadyCounted = localStorage.getItem(VIEW_COUNTED_KEY) === 'true'
    const isNewVisitForServer = !alreadyCounted && tryClaimView()

    const res = await fetch(`${API_URL}/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({
        userId: userId.current,
        isNewVisit: isNewVisitForServer
      })
    })

    const data = await res.json()
    if (data.success) {
      setOnlineCount(data.onlineCount)
      setViewCount(data.views)

      hasVisited.current = true
      try { localStorage.setItem('chatHasVisited', 'true') } catch (e) {}

      if (isNewVisitForServer) {
        markViewCounted()
      }
    }
  } catch (error) {
    console.error('Error updating presence:', error)
  }
}

// Initial load
useEffect(() => {
  fetchMessages()
  fetchSettings()

  if (!presenceInitialized.current) {
    updatePresence()
    presenceInitialized.current = true
  }

  // Poll for updates every 5 seconds
  const interval = setInterval(() => {
    fetchMessages()
    updatePresence()
  }, 5000)

  return () => clearInterval(interval)
}, [])

useEffect(() => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === VIEW_COUNTED_KEY && e.newValue === 'true') {
      updatePresence()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}, [])

useEffect(() => {
  const onUnload = () => {
    navigator.sendBeacon(
      `${API_URL}/presence`,
      JSON.stringify({
        userId: userId.current,
        leave: true
      })
    )
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      onUnload()
    }
  }

  window.addEventListener('beforeunload', onUnload)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('beforeunload', onUnload)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}, [])

// Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle username login
  const handleLogin = () => {
    if (username.trim()) {
      setDisplayName(username.trim())
      localStorage.setItem('chatUsername', username.trim())
      setUsername('')
    } else {
      setDisplayName('гость')
      localStorage.removeItem('chatUsername')
    }
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setPreviewFile({
        url: reader.result as string,
        type: file.type,
        name: file.name
      })
      setShowFilePreview(true)
      setPreviewText('')
    }
    reader.readAsDataURL(file)
  }

  // Send message with file
  const sendMessageWithFile = async () => {
    if (!previewFile) return

    try {
      // Upload file
      const response = await fetch(previewFile.url)
      const blob = await response.blob()
      const file = new File([blob], previewFile.name, { type: previewFile.type })

      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        body: formData
      })

      const uploadData = await uploadRes.json()
      if (!uploadData.success) {
        console.error('Upload failed:', uploadData.error)
        return
      }

      // Send message
      const message: Message = {
        id: Date.now().toString(),
        username: displayName,
        text: previewText.trim(),
        timestamp: Date.now(),
        replyTo: replyingTo?.id || null,
        fileUrl: uploadData.fileUrl,
        fileType: uploadData.fileType,
        fileName: uploadData.fileName
      }

      await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(message)
      })

      setShowFilePreview(false)
      setPreviewFile(null)
      setPreviewText('')
      setReplyingTo(null)
      fetchMessages()
setLastActiveMap(prev => ({ ...prev, [displayName]: Date.now() }))
setLastActiveMap(prev => ({ ...prev, [displayName]: Date.now() }))
    } catch (error) {
      console.error('Error sending message with file:', error)
    }
  }

  // Send message
  const sendMessage = async () => {
    const text = inputText.trim()
    if (!text) return

    // Handle setbg command
    if (text === 'setbg') {
      setShowSetBg(true)
      setInputText('')
      return
    }

    // Handle settheme command
    if (text === 'settheme') {
      setShowSetTheme(true)
      setInputText('')
      return
    }

    try {
      const message: Message = {
        id: Date.now().toString(),
        username: displayName,
        text,
        timestamp: Date.now(),
        replyTo: replyingTo?.id || null
      }

      await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(message)
      })

      setInputText('')
      setReplyingTo(null)
      fetchMessages()
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  // Handle long press
  const handleLongPress = (messageId: string, e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setSelectedMessage(messageId)
    setContextMenuPosition({ x: rect.left, y: rect.top - 60 })
    setShowContextMenu(true)
  }

  const handleMouseDown = (messageId: string, e: React.MouseEvent) => {
    longPressTimer.current = setTimeout(() => {
      handleLongPress(messageId, e)
    }, 500)
  }

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  const handleTouchStart = (messageId: string, e: React.TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      handleLongPress(messageId, e)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  // Reply to message
  const handleReply = () => {
    const msg = messages.find(m => m.id === selectedMessage)
    if (msg) {
      setReplyingTo(msg)
    }
    setShowContextMenu(false)
    setSelectedMessage(null)
  }

  // Delete messages
  const handleDelete = () => {
    setDeleteMode(true)
    setShowContextMenu(false)
  }

  const confirmDelete = async () => {
    const password = prompt('Введите пароль для удаления:')
    if (!password) {
      setDeleteMode(false)
      setSelectedForDelete(new Set())
      return
    }

    try {
      const res = await fetch(`${API_URL}/messages/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          ids: Array.from(selectedForDelete),
          password
        })
      })

      const data = await res.json()
      if (data.success) {
        fetchMessages()
        setDeleteMode(false)
        setSelectedForDelete(new Set())
      } else {
        alert(data.error || 'Ошибка удаления')
      }
    } catch (error) {
      console.error('Error deleting messages:', error)
      alert('Ошибка удаления')
    }
  }

  const toggleSelectMessage = (id: string) => {
    const newSet = new Set(selectedForDelete)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedForDelete(newSet)
  }

  const selectAll = () => {
    setSelectedForDelete(new Set(messages.map(m => m.id)))
  }

  // Set background from URL
  const setBgFromUrl = async () => {
    if (!bgUrl.trim()) return

    try {
      const newSettings = { ...settings, backgroundImage: bgUrl.trim() }
      await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(newSettings)
      })
      setSettings(newSettings)
      setShowSetBg(false)
      setBgUrl('')
    } catch (error) {
      console.error('Error setting background:', error)
    }
  }

  // Set background from file
  const setBgFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/upload-background`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        body: formData
      })

      const data = await res.json()
      if (data.success) {
        const newSettings = { ...settings, backgroundImage: data.url }
        await fetch(`${API_URL}/settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(newSettings)
        })
        setSettings(newSettings)
        setShowSetBg(false)
      }
    } catch (error) {
      console.error('Error setting background from file:', error)
    }
  }

  // Apply theme
  const applyTheme = async () => {
    try {
      const newSettings = {
        ...settings,
        panelColor: themePanel,
        iconColor: themeIcon,
        panelOpacity: themeOpacity
      }

      await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(newSettings)
      })

      setSettings(newSettings)
      setShowSetTheme(false)
    } catch (error) {
      console.error('Error applying theme:', error)
    }
  }

  // Render message content
  const renderMessageContent = (msg: Message) => {
    if (!msg.text && !msg.fileUrl) return null

    // Check if URL is in quotes - then show as clickable text
    const urlInQuotes = msg.text.match(/["']((https?:\/\/[^"']+))["']/i)
    if (urlInQuotes) {
      const url = urlInQuotes[1]
      return (
        <div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">
            {msg.text}
          </a>
        </div>
      )
    }

    // Check for direct URL WITHOUT quotes
    const urlPattern = /^(https?:\/\/[^\s]+)$/i
    const urlMatch = msg.text.match(urlPattern)
    
    if (urlMatch) {
      const url = urlMatch[1]
      
      // YouTube - various formats
      if (url.match(/youtube\.com|youtu\.be/i)) {
        let embedUrl = ''
        
        // Standard watch URL: youtube.com/watch?v=VIDEO_ID
        const watchMatch = url.match(/[?&]v=([^&]+)/)
        if (watchMatch) {
          embedUrl = `https://www.youtube.com/embed/${watchMatch[1]}`
        }
        
        // Short URL: youtu.be/VIDEO_ID
        const shortMatch = url.match(/youtu\.be\/([^?&]+)/)
        if (shortMatch) {
          embedUrl = `https://www.youtube.com/embed/${shortMatch[1]}`
        }
        
        // Embed URL: youtube.com/embed/VIDEO_ID
        const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/)
        if (embedMatch) {
          embedUrl = url
        }
        
        if (embedUrl) {
          return (
            <iframe 
              src={embedUrl} 
              className="w-full rounded" 
              style={{ height: '300px' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )
        }
      }
      
      // Vimeo
      if (url.match(/vimeo\.com/i)) {
        const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1]
        if (videoId) {
          return (
            <iframe 
              src={`https://player.vimeo.com/video/${videoId}`} 
              className="w-full rounded" 
              style={{ height: '300px' }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          )
        }
      }
      
      // TikTok
      if (url.match(/tiktok\.com/i)) {
        const videoId = url.match(/video\/(\d+)/)?.[1]
        if (videoId) {
          return (
            <iframe 
              src={`https://www.tiktok.com/embed/v2/${videoId}`} 
              className="w-full rounded" 
              style={{ height: '500px' }}
              allowFullScreen
            />
          )
        }
      }
      
      // Twitch
      if (url.match(/twitch\.tv/i)) {
        const channelMatch = url.match(/twitch\.tv\/([^\/]+)/)
        if (channelMatch) {
          const channel = channelMatch[1]
          return (
            <iframe 
              src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}`} 
              className="w-full rounded" 
              style={{ height: '300px' }}
              allowFullScreen
            />
          )
        }
      }
      
      // Dailymotion
      if (url.match(/dailymotion\.com/i)) {
        const videoId = url.match(/video\/([^_]+)/)?.[1]
        if (videoId) {
          return (
            <iframe 
              src={`https://www.dailymotion.com/embed/video/${videoId}`} 
              className="w-full rounded" 
              style={{ height: '300px' }}
              allowFullScreen
            />
          )
        }
      }
      
      // SoundCloud
      if (url.match(/soundcloud\.com/i)) {
        return (
          <iframe 
            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`} 
            className="w-full rounded" 
            style={{ height: '166px' }}
          />
        )
      }
      
     // Direct video files - расширенный список всех видео форматов
// Добавил поддержку .m3u8 (HLS). Для .m3u8 указываем тип application/vnd.apple.mpegurl
if (url.match(/\.(mp4|webm|ogg|ogv|mov|avi|mkv|flv|wmv|m4v|3gp|mpg|mpeg|ts|m2ts|mts|m3u8|mxf)(\?.*)?$/i)) {
  const isHls = url.match(/\.m3u8(\?.*)?$/i)
  return (
    <video controls className="max-w-full rounded" style={{ maxHeight: '300px' }}>
      <source src={url} type={isHls ? 'application/vnd.apple.mpegurl' : undefined} />
      Ваш браузер не поддерживает воспроизведение видео.
    </video>
  )
}
      
      // Direct audio files - расширенный список всех аудио форматов
      if (url.match(/\.(mp3|wav|m4a|ogg|oga|aac|flac|wma|aiff|aif|aifc|alac|ape|opus|amr|mid|midi|ra|rm|wv|tta|tak|mka|dts|ac3|eac3|mlp|pcm|au|snd|m4b|m4p|3gp|aa|aax)(\?.*)?$/i)) {
        return (
          <div>
            <audio controls className="w-full" src={url}>
              Ваш браузер не поддерживает воспроизведение аудио.
            </audio>
          </div>
        )
      }
      
      // Direct image files - расширенный список всех графических форматов
      if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff|tif|psd|ai|eps|raw|cr2|nef|orf|sr2|jfif|jpe|heic|heif|avif|apng)(\?.*)?$/i)) {
        return (
          <img 
            src={url} 
            alt="Image" 
            className="max-w-full rounded" 
            style={{ maxHeight: '300px' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.parentElement!.innerHTML = `<a href="${url}" target="_blank" class="text-blue-400 underline">🖼 Открыть изображение</a>`
            }}
          />
        )
      }
      
      // Text and PDF files
      if (url.match(/\.(txt|pdf|doc|docx)(\?.*)?$/i)) {
        return (
          <iframe 
            src={url} 
            className="w-full rounded" 
            style={{ height: '300px' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.parentElement!.innerHTML = `<a href="${url}" target="_blank" class="text-blue-400 underline">📄 Открыть файл</a>`
            }}
          />
        )
      }
      
      // For any other URL, try to embed it as iframe
      return (
        <div>
          <iframe 
            src={url} 
            className="w-full rounded" 
            style={{ height: '300px' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.parentElement!.innerHTML = `<a href="${url}" target="_blank" class="text-blue-400 underline break-all">${url}</a>`
            }}
          />
        </div>
      )
    }

    // Regular text or uploaded file
    return (
      <div>
        {msg.text && <div className="break-words whitespace-pre-wrap">{msg.text}</div>}
        {msg.fileUrl && (
          <div className="mt-2">
            {msg.fileType?.startsWith('image/') && (
              <img src={msg.fileUrl} alt={msg.fileName || 'Image'} className="max-w-full rounded" style={{ maxHeight: '300px' }} />
            )}
          {(msg.fileType?.startsWith('video/') || msg.fileUrl?.match(/\.m3u8(\?.*)?$/i) || msg.fileType === 'application/vnd.apple.mpegurl') && (
  <video controls className="max-w-full rounded" style={{ maxHeight: '300px' }} >
    <source
      src={msg.fileUrl}
      type={
        msg.fileType === 'application/vnd.apple.mpegurl' || msg.fileUrl?.match(/\.m3u8(\?.*)?$/i)
          ? 'application/vnd.apple.mpegurl'
          : msg.fileType
      }
    />
    Ваш браузер не поддерживает воспроизведение видео.
  </video>
)}
            {msg.fileType?.startsWith('audio/') && (
              <audio controls className="w-full" src={msg.fileUrl} />
            )}
            {msg.fileType?.startsWith('text/') && (
              <iframe src={msg.fileUrl} className="w-full rounded" style={{ height: '200px' }} />
            )}
            {!msg.fileType?.match(/^(image|video|audio|text)\//) && (
              <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                📎 {msg.fileName || 'Скачать файл'}
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  // Render reply preview
  const renderReplyPreview = (replyToId: string) => {
    const replyMsg = messages.find(m => m.id === replyToId)
    if (!replyMsg) return null

    let preview = replyMsg.text || ''
    if (replyMsg.fileUrl && replyMsg.fileType?.startsWith('image/')) {
      return (
        <div className="flex items-center gap-2 mb-1 p-2 bg-black/30 rounded border-l-2 border-blue-400">
          <img src={replyMsg.fileUrl} alt="Preview" className="w-10 h-10 object-cover rounded" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-blue-400">{replyMsg.username}</div>
            <div className="text-xs text-gray-400 truncate">{preview || 'Изображение'}</div>
          </div>
        </div>
      )
    }

    if (replyMsg.fileUrl && replyMsg.fileType?.startsWith('video/')) {
      return (
        <div className="flex items-center gap-2 mb-1 p-2 bg-black/30 rounded border-l-2 border-blue-400">
          <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center text-xs">🎥</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-blue-400">{replyMsg.username}</div>
            <div className="text-xs text-gray-400 truncate">{preview || 'Видео'}</div>
          </div>
        </div>
      )
    }

    if (replyMsg.fileUrl && replyMsg.fileType?.startsWith('audio/')) {
      return (
        <div className="flex items-center gap-2 mb-1 p-2 bg-black/30 rounded border-l-2 border-blue-400">
          <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center text-xs">🎵</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-blue-400">{replyMsg.username}</div>
            <div className="text-xs text-gray-400 truncate">{preview || 'Аудио'}</div>
          </div>
        </div>
      )
    }

    return (
      <div className="mb-1 p-2 bg-black/30 rounded border-l-2 border-blue-400">
        <div className="text-xs text-blue-400">{replyMsg.username}</div>
        <div className="text-xs text-gray-400 truncate">{preview || 'Файл'}</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0e1621] overflow-hidden">
      {/* Background Image */}
      {settings.backgroundImage && (
        <div 
          className="fixed inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${settings.backgroundImage})` }}
        />
      )}

      {/* Header */}
      <div 
        className="relative z-10 px-3 py-2 flex items-center gap-3"
        style={{ 
          backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
        }}
      >
        <MessageCircle size={24} style={{ color: settings.iconColor }} />
        <div className="flex-1">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white">👤 {onlineCount}</span>
            <span className="text-white">👁 {viewCount}</span>
          </div>
          <div className="text-xs text-gray-300 mt-0.5">{displayName}</div>
        </div>
        <button onClick={() => setShowInfo(true)} className="p-1">
          <Info size={20} style={{ color: settings.iconColor }} />
        </button>
      </div>

      {/* Username Input */}
      <div 
        className="relative z-10 px-3 py-2 flex gap-2"
        style={{ 
          backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
        }}
      >
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          placeholder="Введите имя..."
          className="flex-1 bg-white/10 text-white px-3 py-2 rounded text-sm outline-none placeholder-gray-400"
        />
        <button
          onClick={handleLogin}
          className="px-4 py-2 rounded text-sm font-medium text-white"
          style={{ backgroundColor: settings.iconColor }}
        >
          Войти
        </button>
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-y-auto px-3 py-2 space-y-2">
       {messages.map((msg, idx) => {
  const isSelected = selectedForDelete.has(msg.id)
  return (
  <div
    key={msg.id}
    className="relative"
    onClick={(e) => {
      if (deleteMode) {
        e.stopPropagation()
        toggleSelectMessage(msg.id)
      }
    }}
    onMouseDown={(e) => handleMouseDown(msg.id, e)}
    onMouseUp={handleMouseUp}
    onTouchStart={(e) => handleTouchStart(msg.id, e)}
    onTouchEnd={handleTouchEnd}
  >
    {deleteMode && (
      <div className="absolute -left-8 top-2 z-10">
        <input
          type="checkbox"
          checked={selectedForDelete.has(msg.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelectMessage(msg.id);
          }}
          className="w-4 h-4"
        />
      </div>
    )}
    <div className="w-full flex justify-start items-start">
      <div
  className="inline-block text-white p-3 rounded-lg max-w-[85%] whitespace-pre-wrap break-words relative"
  style={{
    marginTop: idx === 0 ? '8px' : '0',
    backgroundColor: msg.username === displayName ? 'rgba(6, 78, 59, 0.9)' : 'rgba(34, 58, 86, 0.95)',
    border: isSelected ? '2px solid rgba(255, 80, 80, 0.9)' : undefined,
    boxShadow: isSelected ? '0 0 0 4px rgba(255,80,80,0.06)' : undefined
  }}
>
  {/* Индикатор онлайн/оффлайн: круг в левом верхнем углу сообщения */}
<span  
  className="absolute"  
  style={{  
    width: '10px',  
    height: '10px',  
    borderRadius: '9999px',  
    top: '8px',  
    right: '8px',  
    backgroundColor: isUserOnline(msg.username)
      ? '#FF00FF40' // онлайн
      : '#FFFF0000', // оффлайн
    pointerEvents: 'none',  
    animation: isUserOnline(msg.username) ? 'pulse 1.5s infinite' : 'none', // пульс только онлайн
  }}  
  aria-hidden="true"  
/>
  <div className="text-xs font-medium mb-1 pl-4" style={{ color: settings.iconColor }}>
    {msg.username}
  </div>

        {msg.replyTo && renderReplyPreview(msg.replyTo)}
        {renderMessageContent(msg)}
        <div className="text-xs text-gray-400 mt-1">
          {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  </div>
)})}
        <div ref={messagesEndRef} />
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="fixed z-50 bg-gray-800 rounded-lg shadow-lg overflow-hidden"
          style={{ 
            top: `${contextMenuPosition.y}px`, 
            left: `${contextMenuPosition.x}px`,
            minWidth: '150px'
          }}
        >
          <button
            onClick={handleReply}
            className="w-full px-4 py-2 text-left text-white hover:bg-gray-700"
          >
            Ответить
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 text-left text-white hover:bg-gray-700"
          >
            Удалить
          </button>
        </div>
      )}

      {/* Delete Mode Bar */}
      {deleteMode && (
        <div className="relative z-10 px-3 py-2 bg-gray-800 flex items-center gap-3">
          <button onClick={selectAll} className="text-sm text-blue-400">
            Выбрать всё
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              setDeleteMode(false)
              setSelectedForDelete(new Set())
            }}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Отмена
          </button>
          <button
            onClick={confirmDelete}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm"
          >
            Удалить ({selectedForDelete.size})
          </button>
        </div>
      )}

      {/* Reply Bar */}
      {replyingTo && (
        <div className="relative z-10 px-3 py-2 bg-gray-800 flex items-center gap-2">
          <div className="flex-1 text-sm text-gray-300">
            Ответ на: <span className="text-blue-400">{replyingTo.username}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} className="p-1">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div 
        className="relative z-10 px-3 py-3 flex items-center gap-2"
        style={{ 
          backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-full hover:bg-white/10"
        >
          <Paperclip size={20} style={{ color: settings.iconColor }} />
        </button>
       <textarea
  value={inputText}
  onChange={(e) => setInputText(e.target.value)}
  placeholder="Сообщение..."
  className="flex-1 bg-white/10 text-white px-3 py-2 rounded text-sm outline-none placeholder-gray-400 resize-none"
  rows={2}
  onKeyDown={(e) => {
    // Оставляем Enter как переход на новую строку.
    // Отправка при Ctrl+Enter или Cmd+Enter (опционально).
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  }}
/>

<button
  type="button" // обязательно, чтобы кнопка не триггерила submit формы по умолчанию
  onClick={sendMessage}
  className="p-2 rounded-full"
  style={{ backgroundColor: settings.iconColor }}
>
  <Send size={18} className="text-white" />
</button>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Информация о чате</h2>
              <button onClick={() => setShowInfo(false)}>
                <X size={24} className="text-gray-400" />
              </button>
            </div>
            <div className="text-gray-300 space-y-2 text-sm">
              <p>🌐 Онлайн чат без правил и регистрации.</p>
              <p>👤Для вхола можно использовать имя. Для сброса имени просто нажмите "войти".</p>
              <p>💬 Для ответа на сообщение нажмите и удерживайте на него.</p>
              <p>Доступна отправка файлов в чат. Для отправки кликабельной ссылки на файл/информацию - введите ссылку в кавычках.</p>
              <p>🔆🔆🔆</p>
            </div>
          </div>
        </div>
      )}

      {/* Set Background Modal */}
      {showSetBg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Установить фон</h2>
              <button onClick={() => setShowSetBg(false)}>
                <X size={24} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <input
                  type="text"
                  value={bgUrl}
                  onChange={(e) => setBgUrl(e.target.value)}
                  placeholder="URL изображения"
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm outline-none"
                />
                <button
                  onClick={setBgFromUrl}
                  className="w-full mt-2 px-4 py-2 rounded text-sm font-medium text-white"
                  style={{ backgroundColor: settings.iconColor }}
                >
                  Установить по URL
                </button>
              </div>
              <div className="relative">
                <input
                  ref={bgFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={setBgFromFile}
                  className="hidden"
                />
                <button
                  onClick={() => bgFileInputRef.current?.click()}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded text-sm"
                >
                  Выбрать из устройства
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set Theme Modal */}
      {showSetTheme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Настройка темы</h2>
              <button onClick={() => setShowSetTheme(false)}>
                <X size={24} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 block mb-2">Цвет панелей</label>
                <input
                  type="text"
                  value={themePanel}
                  onChange={(e) => setThemePanel(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm mb-2"
                />
                <input
                  type="color"
                  value={themePanel}
                  onChange={(e) => setThemePanel(e.target.value)}
                  className="w-full h-10 rounded"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 block mb-2">Цвет иконок</label>
                <input
                  type="text"
                  value={themeIcon}
                  onChange={(e) => setThemeIcon(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm mb-2"
                />
                <input
                  type="color"
                  value={themeIcon}
                  onChange={(e) => setThemeIcon(e.target.value)}
                  className="w-full h-10 rounded"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 block mb-2">
                  Прозрачность панелей: {Math.round(themeOpacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={themeOpacity}
                  onChange={(e) => setThemeOpacity(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                onClick={applyTheme}
                className="w-full px-4 py-2 rounded text-sm font-medium text-white"
                style={{ backgroundColor: settings.iconColor }}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {showFilePreview && previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Предпросмотр</h2>
              <button onClick={() => {
                setShowFilePreview(false)
                setPreviewFile(null)
                setPreviewText('')
              }}>
                <X size={24} className="text-gray-400" />
              </button>
            </div>
            <div className="mb-4">
              {previewFile.type.startsWith('image/') && (
                <img src={previewFile.url} alt="Preview" className="max-w-full rounded" />
              )}
              {previewFile.type.startsWith('video/') && (
                <video controls className="max-w-full rounded">
                  <source src={previewFile.url} type={previewFile.type} />
                </video>
              )}
              {previewFile.type.startsWith('audio/') && (
                <audio controls className="w-full" src={previewFile.url} />
              )}
              {!previewFile.type.match(/^(image|video|audio)\//) && (
                <div className="text-gray-300 text-sm">
                  📎 {previewFile.name}
                </div>
              )}
            </div>
            <textarea
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Добавить текст..."
              className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm outline-none mb-4"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowFilePreview(false)
                  setPreviewFile(null)
                  setPreviewText('')
                }}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded text-sm"
              >
                Отмена
              </button>
              <button
                onClick={sendMessageWithFile}
                className="flex-1 px-4 py-2 rounded text-sm font-medium text-white"
                style={{ backgroundColor: settings.iconColor }}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close context menu */}
      {showContextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowContextMenu(false)}
        />
      )}
    </div>
  )
}
