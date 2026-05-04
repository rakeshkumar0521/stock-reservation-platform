'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Toaster, toast } from 'sonner'

// --- Helpers ----------------------------------

const formatPrice = (price) => `$${price.toLocaleString()}`

const formatTimeRemaining = (expiresAt) => {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { text: 'Expired', seconds: 0, percent: 0 }

  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  const totalSeconds = Math.floor(diff / 1000)

  return {
    text: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    seconds: totalSeconds,
    percent: Math.min((totalSeconds / 600) * 100, 100),
  }
}