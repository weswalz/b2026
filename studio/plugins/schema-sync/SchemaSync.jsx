import React, { useState } from 'react'
import { Button, Card, Spinner, Stack, Text, useToast } from '@sanity/ui'
import { SyncIcon } from '@sanity/icons'

const SchemaSync = () => {
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const handleSync = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/schema-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.push({
          status: 'success',
          title: 'Schemas synced successfully',
          description: result.message || 'The schemas have been updated from GitHub.',
        })
      } else {
        throw new Error(result.message || 'Failed to sync schemas')
      }
    } catch (error) {
      toast.push({
        status: 'error',
        title: 'Sync failed',
        description: error.message || 'Something went wrong while syncing schemas.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card padding={4} radius={2} shadow={1} marginTop={4}>
      <Stack space={3}>
        <Text weight="semibold" size={2}>
          Sync Schemas from GitHub
        </Text>
        <Text size={1} muted>
          Click the button below to synchronize schema types with the central repository. This will pull the latest schemas from GitHub.
        </Text>
        <Button
          icon={isLoading ? <Spinner /> : SyncIcon}
          text={isLoading ? 'Syncing...' : 'Sync Schemas'}
          tone="primary"
          onClick={handleSync}
          disabled={isLoading}
        />
      </Stack>
    </Card>
  )
}

export default SchemaSync 