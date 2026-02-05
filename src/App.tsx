import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Info, Paperclip, Send, X, EyeOff, ChevronDown, ChevronRight, User, Eye } from 'lucide-react'
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
  edited?: boolean
  usernameColor?: string | null
}

interface Settings {
  backgroundImage: string | null
  panelColor: string
  iconColor: string
  panelOpacity: number
}

// Spoiler component
function SpoilerBlock({ title, content, fileUrl, fileType, fileName }: { 
  title: string
  content: string
  fileUrl?: string | null
  fileType?: string | null
  fileName?: string | null
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Check if content contains file link
  const fileLinkMatch = content.match(/\[file:([^\]]+)\]/)
  const hasFileLink = fileLinkMatch && fileName === fileLinkMatch[1]
  const textContent = content.replace(/\[file:[^\]]+\]/g, '').trim()
  
  return (
    <div className="my-1 rounded bg-black/30 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
      >
        {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        <EyeOff size={14} className="text-gray-400" />
        <span className="text-sm text-gray-300">{title || 'Спойлер'}</span>
      </button>
      {isOpen && (
        <div className="px-3 py-2 border-t border-white/10">
          {textContent && <div className="text-white break-words whitespace-pre-wrap">{textContent}</div>}
          {hasFileLink && fileUrl && (
            <div className="mt-2">
              {fileType?.startsWith('image/') && (
                <img src={fileUrl} alt={fileName || 'Image'} className="max-w-full rounded" style={{ maxHeight: '300px' }} />
              )}
              {fileType?.startsWith('video/') && (
                <video controls className="max-w-full rounded" style={{ maxHeight: '300px' }}>
                  <source src={fileUrl} type={fileType} />
                </video>
              )}
              {fileType?.startsWith('audio/') && (
                <audio controls className="w-full" src={fileUrl} />
              )}
              {!fileType?.match(/^(image|video|audio)\//) && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                  {fileName || 'Скачать файл'}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
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
  const [showToolbar, setShowToolbar] = useState(false)
  const [spoilerOpen, setSpoilerOpen] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [usernameColor, setUsernameColor] = useState(() => {
    return localStorage.getItem('chatUsernameColor') || '#ebef00'
  })
  const [tempColor, setTempColor] = useState('#ebef00')
  
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
    // Count a view only on the first presence update after the page loads.
    // presenceInitialized.current будет false до первого вызова updatePresence.
    // Это означает: при каждой новой загрузке страницы (или обновлении) первый вызов
    // updatePresence отправит isNewVisit: true, а последующие (периодические)
    // вызовы — false.
    const isNewVisitForServer = !presenceInitialized.current

    const res = await fetch(`${API_URL}/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({
        userId: userId.current,
        username: displayName,
        isNewVisit: isNewVisitForServer
      })
    })

    const data = await res.json()
    if (data.success) {
      setOnlineCount(data.onlineCount)
      setViewCount(data.views)

      hasVisited.current = true
      try { localStorage.setItem('chatHasVisited', 'true') } catch (e) {}

      // Мы не ставим больше долгоживущий флаг в localStorage —
      // нам нужно считать просмотр при каждой загрузке страницы.
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
  }, 10000)

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

  // Handle username login/logout
  const handleLogin = () => {
    if (displayName !== 'гость') {
      // Выход - если уже залогинен
      setDisplayName('гость')
      localStorage.removeItem('chatUsername')
      setUsername('')
    } else if (username.trim()) {
      // Показать выбор цвета перед входом
      setTempColor(usernameColor)
      setShowColorPicker(true)
    }
  }
  
  // Подтверждение входа с выбранным цветом
  const confirmLogin = () => {
    setDisplayName(username.trim())
    localStorage.setItem('chatUsername', username.trim())
    setUsernameColor(tempColor)
    localStorage.setItem('chatUsernameColor', tempColor)
    setUsername('')
    setShowColorPicker(false)
  }

  // Handle file selection - now shows small preview above input
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
    }
    reader.readAsDataURL(file)
  }

  // Insert file link into input text at cursor position
  const insertFileLink = () => {
    if (!previewFile) return
    const linkText = `[file:${previewFile.name}]`
    setInputText(prev => prev + linkText)
  }

  // Handle spoiler toggle
  const handleSpoilerClick = () => {
    if (!spoilerOpen) {
      const title = prompt('Введите название спойлера:')
      if (title !== null) {
        setInputText(prev => prev + `[spoiler:${title}]`)
        setSpoilerOpen(true)
      }
    } else {
      setInputText(prev => prev + '[/spoiler]')
      setSpoilerOpen(false)
    }
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
      text: inputText.trim(),
      timestamp: Date.now(),
      replyTo: replyingTo?.id || null,
      fileUrl: uploadData.fileUrl,
      fileType: uploadData.fileType,
      fileName: uploadData.fileName,
      usernameColor: usernameColor
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
  setInputText('')
  setReplyingTo(null)
  setSpoilerOpen(false)
  fetchMessages()
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
      replyTo: replyingTo?.id || null,
      usernameColor: usernameColor
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
  setSpoilerOpen(false)
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

// Конвертирует hex -> "rgba(r, g, b, a)"
const hexToRgba = (hex: string | undefined | null, alpha = 0.7) => {
  if (!hex || typeof hex !== 'string') return `rgba(34, 58, 86, ${alpha})` // запасной цвет
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(34, 58, 86, ${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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

    // Parse and render spoilers and file links in text
    const renderTextWithSpoilersAndLinks = (text: string, fileUrl?: string | null, fileType?: string | null, fileName?: string | null) => {
      const spoilerRegex = /\[spoiler:([^\]]*)\]([\s\S]*?)\[\/spoiler\]/g
      const fileLinkRegex = /\[file:([^\]]+)\]/g
      
      let result: React.ReactNode[] = []
      let lastIndex = 0
      let match
      let tempText = text
      
      // First, handle spoilers
      const parts: React.ReactNode[] = []
      let partLastIndex = 0
      
      while ((match = spoilerRegex.exec(text)) !== null) {
        // Add text before spoiler
        if (match.index > partLastIndex) {
          parts.push(text.slice(partLastIndex, match.index))
        }
        
        const spoilerTitle = match[1]
        const spoilerContent = match[2]
        const spoilerKey = `spoiler-${match.index}`
        
        parts.push(
          <SpoilerBlock key={spoilerKey} title={spoilerTitle} content={spoilerContent} fileUrl={fileUrl} fileType={fileType} fileName={fileName} />
        )
        
        partLastIndex = match.index + match[0].length
      }
      
      // Add remaining text after last spoiler
      if (partLastIndex < text.length) {
        parts.push(text.slice(partLastIndex))
      }
      
      // If no spoilers found, process file links
      if (parts.length === 0) {
        parts.push(text)
      }
      
      // Process file links in text parts
      return parts.map((part, idx) => {
        if (typeof part === 'string') {
          // Check for file links
          const linkParts: React.ReactNode[] = []
          let linkLastIndex = 0
          let linkMatch
          
          while ((linkMatch = fileLinkRegex.exec(part)) !== null) {
            if (linkMatch.index > linkLastIndex) {
              linkParts.push(part.slice(linkLastIndex, linkMatch.index))
            }
            
            const linkedFileName = linkMatch[1]
            // If this file link matches our attached file, render it
            if (fileUrl && fileName === linkedFileName) {
              linkParts.push(
                <span key={`link-${linkMatch.index}`} className="inline-block my-1">
                  {fileType?.startsWith('image/') && (
                    <img src={fileUrl} alt={fileName || 'Image'} className="max-w-full rounded" style={{ maxHeight: '300px' }} />
                  )}
                  {fileType?.startsWith('video/') && (
                    <video controls className="max-w-full rounded" style={{ maxHeight: '300px' }}>
                      <source src={fileUrl} type={fileType} />
                    </video>
                  )}
                  {fileType?.startsWith('audio/') && (
                    <audio controls className="w-full" src={fileUrl} />
                  )}
                  {!fileType?.match(/^(image|video|audio)\//) && (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                      {fileName || 'Скачать файл'}
                    </a>
                  )}
                </span>
              )
            } else {
              linkParts.push(linkMatch[0])
            }
            
            linkLastIndex = linkMatch.index + linkMatch[0].length
          }
          
          if (linkLastIndex < part.length) {
            linkParts.push(part.slice(linkLastIndex))
          }
          
          return linkParts.length > 0 ? <span key={idx}>{linkParts}</span> : part
        }
        return part
      })
    }

    // Regular text or uploaded file
    return (
      <div>
        {msg.text && <div className="break-words whitespace-pre-wrap">{renderTextWithSpoilersAndLinks(msg.text, msg.fileUrl, msg.fileType, msg.fileName)}</div>}
        {msg.fileUrl && !msg.text?.includes(`[file:${msg.fileName}]`) && (
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
            <div className="text-xs" style={{ color: '#ebef00' }}>{replyMsg.username}</div>
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
            <div className="text-xs" style={{ color: '#ebef00' }}>{replyMsg.username}</div>
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
            <div className="text-xs" style={{ color: '#ebef00' }}>{replyMsg.username}</div>
            <div className="text-xs text-gray-400 truncate">{preview || 'Аудио'}</div>
          </div>
        </div>
      )
    }

    return (
      <div className="mb-1 p-2 bg-black/30 rounded border-l-2 border-blue-400">
        <div className="text-xs" style={{ color: '#ebef00' }}>{replyMsg.username}</div>
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
        className="relative z-10 px-3 py-2 flex items-center justify-between"
        style={{ 
          backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
        }}
      >
{/* Левая часть: иконка сообщения и имя пользователя */}
        <div className="flex items-center gap-2">
          <MessageCircle size={20} style={{ color: settings.iconColor }} />
          <span className="text-sm">
            <span className="text-white">Вы: </span>
            <span style={{ color: usernameColor }}>{displayName}</span>
          </span>
        </div>
        
        {/* Правая часть: статусы и инфо */}
        <div className="flex items-center gap-3">
<div className="flex items-center" style={{ gap: '24px' }}>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1">
                <User size={12} className="text-white" />
                <span className="text-white text-xs font-medium">{onlineCount}</span>
              </div>
              <span className="text-gray-400" style={{ fontSize: '8px' }}>онлайн</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1">
                <Eye size={12} className="text-white" />
                <span className="text-white text-xs font-medium">{viewCount}</span>
              </div>
              <span className="text-gray-400" style={{ fontSize: '8px' }}>просмотров</span>
            </div>
          </div>
          <button onClick={() => setShowInfo(true)} className="p-1">
            <Info size={20} style={{ color: settings.iconColor }} />
          </button>
        </div>
      </div>

      {/* Username Input */}
      <div 
        className="relative z-10 px-3 py-2 flex gap-2"
        style={{ 
          backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
        }}
      >
        {displayName === 'гость' && (
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Введите имя..."
            className="flex-1 bg-white/10 text-white px-3 py-2 rounded text-sm outline-none placeholder-gray-400"
          />
        )}
        <button
          onClick={handleLogin}
          className="px-4 py-2 rounded text-sm font-medium text-white transition-colors"
          style={{ 
            backgroundColor: displayName !== 'гость' ? '#ef4444' : settings.iconColor 
          }}
        >
          {displayName !== 'гость' ? 'Выйти' : 'Войти'}
        </button>
      </div>

    {/* Messages */}
      <div className="relative flex-1 overflow-y-auto px-3 py-2 space-y-2">
       {messages.map((msg, idx) => {
  const isSelected = selectedForDelete.has(msg.id)
  const content = renderMessageContent(msg)
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
              e.stopPropagation()
              toggleSelectMessage(msg.id)
            }}
            className="w-4 h-4"
          />
        </div>
      )}
      <div className="w-full flex justify-start items-start">
        <div
          className="inline-block text-white p-3 rounded-lg max-w-[85%] whitespace-pre-wrap break-words"
          style={{
            marginTop: idx === 0 ? '8px' : '0',
            backgroundColor: hexToRgba('#003a21', 0.8),
            border: isSelected ? '2px solid rgba(255, 80, 80, 0.9)' : undefined,
            boxShadow: isSelected ? '0 0 0 4px rgba(255,80,80,0.06)' : undefined
          }}
        >
<div className="text-xs font-medium mb-1" style={{ color: msg.usernameColor || '#ebef00' }}>
                    {msg.username}
                  </div>

          {msg.replyTo && renderReplyPreview(msg.replyTo)}

          {content ?? (msg.text ? <div className="break-words whitespace-pre-wrap">{msg.text}</div> : null)}

          <div className="text-xs text-gray-400 mt-1">
            {new Date(msg.timestamp).toLocaleString('ru-RU', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
            {msg.edited && <span className="ml-1 italic">(ред.)</span>}
          </div>
        </div>
      </div>
    </div>
  )
})}
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
            Ответ на: <span style={{ color: '#ebef00' }}>{replyingTo.username}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} className="p-1">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
      )}

      {/* Small File Preview above input (Telegram style) */}
      {showFilePreview && previewFile && (
        <div 
          className="relative z-10 px-3 py-2 flex items-center gap-2"
          style={{ 
            backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
          }}
        >
          <div 
            className="relative cursor-pointer group"
            onClick={insertFileLink}
            title="Нажмите чтобы вставить ссылку на файл"
          >
            {previewFile.type.startsWith('image/') && (
              <img src={previewFile.url} alt="Preview" className="h-16 w-16 object-cover rounded" style={{ maxWidth: '64px', maxHeight: '64px' }} />
            )}
            {previewFile.type.startsWith('video/') && (
              <div className="h-16 w-16 bg-gray-700 rounded flex items-center justify-center">
                <video src={previewFile.url} className="h-16 w-16 object-cover rounded" muted />
              </div>
            )}
            {previewFile.type.startsWith('audio/') && (
              <div className="h-16 w-16 bg-gray-700 rounded flex items-center justify-center text-2xl">
                🎵
              </div>
            )}
            {!previewFile.type.match(/^(image|video|audio)\//) && (
              <div className="h-16 w-16 bg-gray-700 rounded flex items-center justify-center text-2xl">
                📎
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-white text-xs text-center px-1">Вставить ссылку</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{previewFile.name}</div>
            <div className="text-xs text-gray-400">Нажмите на превью для вставки ссылки</div>
          </div>
          <button
            onClick={() => {
              setShowFilePreview(false)
              setPreviewFile(null)
            }}
            className="p-1"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
      )}

      {/* Toolbar (appears on focus) */}
      {showToolbar && (
        <div 
          className="relative z-10 px-3 py-1 flex items-center gap-2"
          style={{ 
            backgroundColor: `${settings.panelColor}${Math.round(settings.panelOpacity * 255).toString(16).padStart(2, '0')}` 
          }}
        >
          <button
            onClick={handleSpoilerClick}
            className={`p-2 rounded hover:bg-white/10 flex items-center gap-1 ${spoilerOpen ? 'bg-white/20' : ''}`}
            title={spoilerOpen ? 'Закрыть спойлер' : 'Добавить спойлер'}
          >
            <EyeOff size={16} style={{ color: settings.iconColor }} />
            <span className="text-xs text-gray-300">{spoilerOpen ? '[/spoiler]' : 'Спойлер'}</span>
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
  onFocus={() => setShowToolbar(true)}
  onBlur={(e) => {
    // Delay hiding to allow clicking toolbar buttons
    setTimeout(() => {
      if (!document.activeElement?.closest('.toolbar-area')) {
        setShowToolbar(false)
      }
    }, 200)
  }}
  placeholder="Сообщение..."
  className="flex-1 bg-white/10 text-white px-3 py-2 rounded text-sm outline-none placeholder-gray-400 resize-none"
  rows={2}
  onKeyDown={(e) => {
    // Оставляем Enter как переход на новую строку.
    // Отправка при Ctrl+Enter или Cmd+Enter (опционально).
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (showFilePreview && previewFile) {
        sendMessageWithFile();
      } else {
        sendMessage();
      }
    }
  }}
/>

<button
  type="button"
  onClick={() => {
    if (showFilePreview && previewFile) {
      sendMessageWithFile();
    } else {
      sendMessage();
    }
  }}
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
              <p>💬 Для ответа на со��бщение нажмите и удерживайте на него.</p>
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

{/* Color Picker Modal */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-gray-800 rounded-lg p-5 max-w-xs w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Цвет имени</h2>
              <button onClick={() => setShowColorPicker(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Предпросмотр */}
              <div className="text-center py-2 bg-gray-900 rounded">
                <span className="text-sm font-medium" style={{ color: tempColor }}>
                  {username.trim()}
                </span>
              </div>
              
              {/* HEX код */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">HEX код</label>
                <input
                  type="text"
                  value={tempColor}
                  onChange={(e) => setTempColor(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
                  placeholder="#ffffff"
                />
              </div>
              
              {/* Цветовой пикер */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Выберите цвет</label>
                <input
                  type="color"
                  value={tempColor}
                  onChange={(e) => setTempColor(e.target.value)}
                  className="w-full h-12 rounded cursor-pointer"
                  style={{ padding: 0 }}
                />
              </div>
              
              {/* Быстрые цвета */}
              <div>
                <label className="text-xs text-gray-400 block mb-2">Быстрый выбор</label>
                <div className="flex flex-wrap gap-2">
                  {['#ff4444', '#ff8800', '#ffcc00', '#44ff44', '#00ccff', '#8844ff', '#ff44ff', '#ffffff'].map(color => (
                    <button
                      key={color}
                      onClick={() => setTempColor(color)}
                      className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ 
                        backgroundColor: color,
                        borderColor: tempColor === color ? '#fff' : 'transparent'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowColorPicker(false)}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded text-sm"
              >
                Отмена
              </button>
              <button
                onClick={confirmLogin}
                className="flex-1 px-4 py-2 text-white rounded text-sm"
                style={{ backgroundColor: settings.iconColor }}
              >
                Войти
              </button>
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
