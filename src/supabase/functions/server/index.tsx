import { Hono } from 'npm:hono'
import { cors } from 'npm:hono/cors'
import { logger } from 'npm:hono/logger'
import { createClient } from 'npm:@supabase/supabase-js'
import * as kv from './kv_store.tsx'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger(console.log))

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

// Create storage bucket on startup
const bucketName = 'make-98c5d13a-chat-files'
const { data: buckets } = await supabase.storage.listBuckets()
const bucketExists = buckets?.some(bucket => bucket.name === bucketName)
if (!bucketExists) {
  await supabase.storage.createBucket(bucketName, { public: false })
  console.log('Created storage bucket:', bucketName)
}

// Get all messages
app.get('/make-server-98c5d13a/messages', async (c) => {
  try {
    const messages = await kv.getByPrefix('msg_')
    const sortedMessages = messages.sort((a: any, b: any) => a.timestamp - b.timestamp)
    return c.json({ success: true, messages: sortedMessages })
  } catch (error) {
    console.log('Error fetching messages:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Create message
app.post('/make-server-98c5d13a/messages', async (c) => {
  try {
    const body = await c.req.json()
    const { id, username, text, timestamp, replyTo, fileUrl, fileType, fileName } = body
    
    const message = {
      id,
      username,
      text,
      timestamp,
      replyTo: replyTo || null,
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      fileName: fileName || null
    }
    
    await kv.set(`msg_${id}`, message)
    
    return c.json({ success: true, message })
  } catch (error) {
    console.log('Error creating message:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Delete messages
app.post('/make-server-98c5d13a/messages/delete', async (c) => {
  try {
    const body = await c.req.json()
    const { ids, password } = body
    
    if (password !== 'Ramakrishna') {
      return c.json({ success: false, error: 'Неверный пароль' }, 403)
    }
    
    const deleteKeys = ids.map((id: string) => `msg_${id}`)
    await kv.mdel(deleteKeys)
    
    return c.json({ success: true })
  } catch (error) {
    console.log('Error deleting messages:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Edit message - only the author can edit their own message
app.post('/make-server-98c5d13a/messages/edit', async (c) => {
  try {
    const body = await c.req.json()
    const { id, newText, username } = body
    
    if (!id || typeof newText !== 'string' || !username) {
      return c.json({ success: false, error: 'Неверные параметры' }, 400)
    }
    
    // Get the existing message
    const existingMessage = await kv.get(`msg_${id}`)
    
    if (!existingMessage) {
      return c.json({ success: false, error: 'Сообщение не найдено' }, 404)
    }
    
    // Check if the username matches (case-sensitive)
    if (existingMessage.username !== username) {
      return c.json({ success: false, error: 'Вы можете редактировать только свои сообщения' }, 403)
    }
    
    // Update the message with new text and add editedAt timestamp
    const updatedMessage = {
      ...existingMessage,
      text: newText.trim(),
      editedAt: Date.now()
    }
    
    await kv.set(`msg_${id}`, updatedMessage)
    
    return c.json({ success: true, message: updatedMessage })
  } catch (error) {
    console.log('Error editing message:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Upload file
app.post('/make-server-98c5d13a/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return c.json({ success: false, error: 'No file provided' }, 400)
    }
    
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    const fileBuffer = await file.arrayBuffer()
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false
      })
    
    if (error) {
      console.log('Storage upload error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }
    
    // Create signed URL valid for 10 years
    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 315360000)
    
    return c.json({ 
      success: true, 
      fileUrl: urlData?.signedUrl,
      fileType: file.type,
      fileName: file.name
    })
  } catch (error) {
    console.log('Error uploading file:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get settings
app.get('/make-server-98c5d13a/settings', async (c) => {
  try {
    const settings = await kv.get('chat_settings') || {
      backgroundImage: null,
      panelColor: '#1a1a1a',
      iconColor: '#64b5f6',
      panelOpacity: 0.85
    }
    return c.json({ success: true, settings })
  } catch (error) {
    console.log('Error fetching settings:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update settings
app.post('/make-server-98c5d13a/settings', async (c) => {
  try {
    const body = await c.req.json()
    await kv.set('chat_settings', body)
    return c.json({ success: true })
  } catch (error) {
    console.log('Error updating settings:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get stats (online users and views)
app.get('/make-server-98c5d13a/stats', async (c) => {
  try {
    const stats = await kv.get('chat_stats') || { views: 0, onlineUsers: [] }
    
    // Clean up old online users (older than 10 seconds)
    const now = Date.now()
    stats.onlineUsers = (stats.onlineUsers || []).filter(
      (user: any) => now - user.lastSeen < 10000
    )
    
    return c.json({ 
      success: true, 
      views: stats.views,
      onlineCount: stats.onlineUsers.length
    })
  } catch (error) {
    console.log('Error fetching stats:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update user presence
app.post('/make-server-98c5d13a/presence', async (c) => {
  try {
    const body = await c.req.json()
    const { userId, isNewVisit } = body
    
    const stats = await kv.get('chat_stats') || { views: 0, onlineUsers: [] }
    
    // Increment views for new visits
    if (isNewVisit) {
      stats.views = (stats.views || 0) + 1
    }
    
    // Update user's last seen
    const now = Date.now()
    const userIndex = stats.onlineUsers.findIndex((u: any) => u.id === userId)
    
    if (userIndex >= 0) {
      stats.onlineUsers[userIndex].lastSeen = now
    } else {
      stats.onlineUsers.push({ id: userId, lastSeen: now })
    }
    
    // Clean up old users
    stats.onlineUsers = stats.onlineUsers.filter(
      (user: any) => now - user.lastSeen < 10000
    )
    
    await kv.set('chat_stats', stats)
    
    return c.json({ 
      success: true,
      views: stats.views,
      onlineCount: stats.onlineUsers.length
    })
  } catch (error) {
    console.log('Error updating presence:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Upload background image
app.post('/make-server-98c5d13a/upload-background', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return c.json({ success: false, error: 'No file provided' }, 400)
    }
    
    const fileExt = file.name.split('.').pop()
    const fileName = `bg_${Date.now()}.${fileExt}`
    const fileBuffer = await file.arrayBuffer()
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false
      })
    
    if (error) {
      console.log('Background upload error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }
    
    // Create signed URL valid for 10 years
    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 315360000)
    
    return c.json({ 
      success: true, 
      url: urlData?.signedUrl
    })
  } catch (error) {
    console.log('Error uploading background:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

Deno.serve(app.fetch)
