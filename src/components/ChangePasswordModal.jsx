import { useState } from 'react'
import { Lock, AlertCircle, Shield } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input from './ui/Input'

export default function ChangePasswordModal({ open, onClose, forced = false, onChanged }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setError('')
    if (newPassword.length < 4) { setError('Password must be at least 4 characters.'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return }
    if (newPassword === oldPassword) { setError('New password must be different from the old one.'); return }

    setSaving(true)
    try {
      await window.electronAPI.changePassword(oldPassword, newPassword)
      onChanged?.()
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={forced ? () => {} : onClose}
      title={forced ? 'Set Your Password' : 'Change Password'}
      size="sm"
      footer={!forced && (<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Change Password</Button>
      </>)}
    >
      {forced && (
        <div className="bg-warning-light border border-warning/20 rounded px-3 py-2.5 mb-4 flex items-start gap-2">
          <Shield size={14} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            <strong>You must change your password before continuing.</strong> This is a security requirement on first login or after an admin reset.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-danger-light border border-danger/20 rounded px-3 py-2 mb-4 flex items-start gap-2">
          <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
          <span className="text-xs text-danger">{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <Input
          label="Current Password"
          type="password"
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          required
        />
        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          hint="At least 4 characters"
          required
        />
        <Input
          label="Confirm New Password"
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      {forced && (
        <Button onClick={handleSave} loading={saving} className="w-full mt-4">
          <Lock size={13} />
          Set New Password and Continue
        </Button>
      )}
    </Modal>
  )
}
