import { useState, useEffect } from 'react'
import { Save, Plus, Trash2, GripVertical, Database, Upload, Key, ShieldCheck, UserCircle } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import useAppStore from '../store/appStore'

export default function Settings() {
  const { school, setSchool, categories, signatories, setCategories, setSignatories, refreshCategories, notify } = useAppStore()
  const [tab, setTab] = useState('school')

  const tabs = [
    { id: 'school', label: 'Organization' },
    { id: 'categories', label: 'Categories' },
    { id: 'signatories', label: 'Signatories' },
    { id: 'users', label: 'Users' },
    { id: 'data', label: 'Data & Backup' },
    { id: 'audit', label: 'Audit Log' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Settings</h2>
        <p className="text-sm text-ink-secondary">Configure organization details, categories, and system preferences</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border gap-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl">
        {tab === 'school' && <SchoolTab notify={notify} setSchool={setSchool} />}
        {tab === 'categories' && <CategoriesTab notify={notify} refreshCategories={refreshCategories} />}
        {tab === 'signatories' && <SignatoriesTab notify={notify} />}
        {tab === 'users' && <UsersTab notify={notify} />}
        {tab === 'data' && <DataTab notify={notify} />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

function SchoolTab({ notify, setSchool }) {
  const school = useAppStore(s => s.school)
  const [form, setForm] = useState({ name: '', location: '', organization_type: 'school' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (school) setForm({
      name: school.name || '',
      location: school.location || '',
      organization_type: school.organization_type || 'school',
    })
  }, [school])

  async function handleSave() {
    setSaving(true)
    try {
      await window.electronAPI.saveSchoolConfig(form)
      const updated = await window.electronAPI.getSchoolConfig()
      setSchool(updated)
      notify('Organization info saved')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Organization Information">
      <div className="space-y-4">
        <div>
          <label className="field-label">Organization Type <span className="text-danger">*</span></label>
          <select
            className="field-input"
            value={form.organization_type}
            onChange={e => setForm(f => ({ ...f, organization_type: e.target.value }))}
          >
            <option value="school">School (uses 3 terms per year)</option>
            <option value="business">Business / Company</option>
            <option value="organization">Non-profit / NGO / Other Organization</option>
            <option value="other">Other</option>
          </select>
          <p className="text-xs text-ink-muted mt-1">
            This affects default labels and period types. You can use any period structure regardless of this setting.
          </p>
        </div>

        <Input
          label="Organization Name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={form.organization_type === 'school' ? 'e.g. SIR APOLLO KAGGWA BOARDING PRIMARY SCHOOL' : 'e.g. ACME LIMITED'}
          required
        />
        <Input
          label="Location / Sub-title"
          value={form.location}
          onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          placeholder="e.g. KAMPALA, UGANDA"
        />

        <Button onClick={handleSave} loading={saving}>
          <Save size={14} />
          Save Organization Info
        </Button>
      </div>
    </Card>
  )
}

function CategoriesTab({ notify, refreshCategories }) {
  const [cats, setCats] = useState([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.electronAPI.getCategories().then(setCats)
  }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await window.electronAPI.saveCategory({ name: newName.trim().toUpperCase() })
      const updated = await window.electronAPI.getCategories()
      setCats(updated)
      refreshCategories()
      setNewName('')
      notify('Category added')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(cat) {
    try {
      await window.electronAPI.saveCategory({ ...cat, is_active: cat.is_active ? 0 : 1 })
      const updated = await window.electronAPI.getCategories()
      setCats(updated)
      refreshCategories()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this category? Existing entries that reference it will lose their split amounts.')) return
    try {
      await window.electronAPI.deleteCategory(id)
      const updated = await window.electronAPI.getCategories()
      setCats(updated)
      refreshCategories()
      notify('Category deleted')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <Card title="Expenditure Categories">
      <div className="space-y-4">
        <div className="space-y-1">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className={`flex-1 text-sm ${cat.is_active ? 'text-ink' : 'text-ink-muted line-through'}`}>
                {cat.name}
              </span>
              <Badge variant={cat.is_active ? 'success' : 'neutral'}>
                {cat.is_active ? 'Active' : 'Hidden'}
              </Badge>
              <button
                onClick={() => handleToggle(cat)}
                className="text-xs text-accent hover:underline"
              >
                {cat.is_active ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => handleDelete(cat.id)}
                className="p-1 text-ink-muted hover:text-danger rounded"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Input
            placeholder="New category name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <Button onClick={handleAdd} loading={saving}>
            <Plus size={14} />
            Add
          </Button>
        </div>
      </div>
    </Card>
  )
}

function SignatoriesTab({ notify }) {
  const [sigs, setSigs] = useState([])
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', title: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.electronAPI.getSignatories().then(setSigs)
  }, [])

  async function handleSave() {
    if (!form.name.trim() || !form.title.trim()) return
    setSaving(true)
    try {
      await window.electronAPI.saveSignatory({ ...form, ...(editId ? { id: editId } : {}) })
      const updated = await window.electronAPI.getSignatories()
      setSigs(updated)
      setEditId(null)
      setForm({ name: '', title: '' })
      notify('Signatory saved')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await window.electronAPI.deleteSignatory(id)
      setSigs(sigs.filter(s => s.id !== id))
      notify('Signatory removed')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  function startEdit(sig) {
    setEditId(sig.id)
    setForm({ name: sig.name, title: sig.title })
  }

  return (
    <Card title="Report Signatories">
      <p className="text-xs text-ink-secondary mb-4">These names appear on the signature block at the bottom of printed reports.</p>
      <div className="space-y-1 mb-4">
        {sigs.map(sig => (
          <div key={sig.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">{sig.name}</p>
              <p className="text-xs text-ink-secondary">{sig.title}</p>
            </div>
            <button onClick={() => startEdit(sig)} className="text-xs text-accent hover:underline">Edit</button>
            <button onClick={() => handleDelete(sig.id)} className="p-1 text-ink-muted hover:text-danger rounded">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold text-ink-secondary">{editId ? 'Edit Signatory' : 'Add Signatory'}</p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Full Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. NYAWERE JANE"
          />
          <Input
            label="Title / Role"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. HEADTEACHER"
          />
        </div>
        <div className="flex gap-2">
          {editId && (
            <Button variant="secondary" onClick={() => { setEditId(null); setForm({ name: '', title: '' }) }}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} loading={saving}>
            <Save size={14} />
            {editId ? 'Save Changes' : 'Add Signatory'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function DataTab({ notify }) {
  const [loading, setLoading] = useState(false)

  async function handleBackup() {
    const isWeb = window.__IMPREST_MODE__ === 'web'
    setLoading(true)
    try {
      if (isWeb) {
        await window.electronAPI.backupDatabase()
        notify('Backup downloaded')
      } else {
        const result = await window.electronAPI.saveFileDialog({
          title: 'Save Database Backup',
          defaultPath: `imprest-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`,
          filters: [{ name: 'SQLite Database', extensions: ['sqlite3', 'db'] }],
        })
        if (result.canceled || !result.filePath) { setLoading(false); return }
        await window.electronAPI.backupDatabase(result.filePath)
        notify('Backup saved successfully')
      }
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleRestore() {
    if (!confirm('Restore will replace ALL current data with the backup. This cannot be undone. Continue?')) return
    const result = await window.electronAPI.openFileDialog({
      title: 'Select Backup File',
      filters: [{ name: 'SQLite Database', extensions: ['sqlite3', 'db'] }],
    })
    if (result.canceled || !result.filePaths?.[0]) return
    setLoading(true)
    try {
      // Desktop: filePaths[0] is a path string. Web: it's a File object.
      await window.electronAPI.restoreDatabase(result.filePaths[0])
      notify('Database restored. Please reload the app.')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="Data Management">
      <div className="space-y-5">
        <div className="border border-border rounded p-4 space-y-2">
          <div className="flex items-start gap-3">
            <Database size={20} strokeWidth={1.5} className="text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink">Backup Database</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                Save a copy of the entire database to your chosen location. Do this regularly to prevent data loss.
              </p>
            </div>
          </div>
          <Button onClick={handleBackup} loading={loading} size="sm">
            <Database size={13} />
            Export Backup
          </Button>
        </div>

        <div className="border border-danger/30 rounded p-4 space-y-2 bg-danger-light/30">
          <div className="flex items-start gap-3">
            <Upload size={20} strokeWidth={1.5} className="text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-danger">Restore Database</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                Replace the current database with a backup file. <strong>All existing data will be lost.</strong>
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={handleRestore} loading={loading}>
            <Upload size={13} />
            Restore from Backup
          </Button>
        </div>
      </div>
    </Card>
  )
}

function AuditTab() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await window.electronAPI.getAuditLog({ limit: 500 })
      setLogs(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = logs.filter(l =>
    !filter ||
    l.table_name.includes(filter.toLowerCase()) ||
    l.action.toLowerCase().includes(filter.toLowerCase())
  )

  const tableLabels = {
    entries: 'Entry',
    imprest_cycles: 'Cycle',
    terms: 'Period',
    categories: 'Category',
    signatories: 'Signatory',
    school_config: 'Organization',
  }

  const actionStyles = {
    INSERT: 'success',
    UPDATE: 'info',
    DELETE: 'danger',
  }

  return (
    <Card
      title="Audit Log"
      action={<Button size="sm" variant="secondary" onClick={load} loading={loading}>Refresh</Button>}
    >
      <p className="text-xs text-ink-secondary mb-3">
        All create, update, and delete actions are recorded here. Showing the most recent 500 entries.
      </p>

      <div className="mb-3">
        <input
          className="field-input"
          placeholder="Filter by table or action..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">Loading audit log...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8">No audit entries{filter ? ' matching filter' : ''}.</p>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">When</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">User</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">Action</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">Type</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">ID</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="max-h-96">
              {filtered.map(log => {
                let detail = ''
                try {
                  const d = log.action === 'DELETE' ? log.old_values : log.new_values
                  if (d) {
                    const parsed = JSON.parse(d)
                    detail = previewAuditDetail(log.table_name, parsed)
                  }
                } catch (_) {}
                return (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-xs font-mono text-ink-secondary whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-ink">
                      {log.full_name || log.username || <span className="text-ink-muted italic">system</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant={actionStyles[log.action] || 'neutral'}>{log.action}</Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs">{tableLabels[log.table_name] || log.table_name}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-ink-secondary">#{log.record_id}</td>
                    <td className="px-3 py-1.5 text-xs text-ink-secondary truncate max-w-md">{detail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function UsersTab({ notify }) {
  const currentUser = useAppStore(s => s.currentUser)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ username: '', full_name: '', role: 'accountant', password: '' })
  const [resetPwUserId, setResetPwUserId] = useState(null)
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await window.electronAPI.listUsers()
      setUsers(data)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditUser(null)
    setForm({ username: '', full_name: '', role: 'accountant', password: '' })
    setShowModal(true)
  }

  function openEdit(user) {
    setEditUser(user)
    setForm({
      username: user.username,
      full_name: user.full_name || '',
      role: user.role,
      password: '',
      is_active: !!user.is_active,
    })
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (editUser) {
        await window.electronAPI.updateUser(editUser.id, {
          full_name: form.full_name,
          role: form.role,
          is_active: form.is_active ? 1 : 0,
        })
        notify('User updated')
      } else {
        await window.electronAPI.createUser({
          username: form.username,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
          must_change_password: 1,
        })
        notify('User created — they must change password on first login')
      }
      setShowModal(false)
      load()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this user? They will no longer be able to sign in.')) return
    try {
      await window.electronAPI.deleteUser(id)
      notify('User deleted')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function handleResetPassword() {
    setSaving(true)
    try {
      await window.electronAPI.resetUserPassword(resetPwUserId, newPw)
      notify('Password reset — user must change it on next login')
      setResetPwUserId(null)
      setNewPw('')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const roleStyles = {
    admin: 'danger',
    accountant: 'info',
    viewer: 'neutral',
  }

  return (
    <Card
      title="Users & Roles"
      action={<Button size="sm" onClick={openCreate}><Plus size={13} /> New User</Button>}
    >
      <p className="text-xs text-ink-secondary mb-4">
        Manage who can access this system. <strong>Admin</strong> can do everything.
        <strong> Accountant</strong> can record entries, manage cycles. <strong>Viewer</strong> can only read.
      </p>

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-8">Loading users...</p>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">User</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">Role</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary uppercase">Last Login</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <p className="text-sm font-medium text-ink">{u.full_name || u.username}</p>
                    <p className="text-xs text-ink-secondary">@{u.username}{u.id === currentUser?.id ? ' (you)' : ''}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={roleStyles[u.role] || 'neutral'}>{u.role}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={u.is_active ? 'success' : 'neutral'}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                    {u.must_change_password ? (
                      <span className="text-2xs text-warning ml-2">password reset pending</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-secondary">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(u)} className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-ink" title="Edit">
                        <UserCircle size={13} />
                      </button>
                      <button onClick={() => { setResetPwUserId(u.id); setNewPw('') }} className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-warning" title="Reset password">
                        <Key size={13} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleDelete(u.id)} className="p-1 hover:bg-gray-100 rounded text-ink-secondary hover:text-danger" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit user */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editUser ? `Edit user: ${editUser.username}` : 'Create New User'}
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{editUser ? 'Save' : 'Create User'}</Button>
        </>}
      >
        <div className="space-y-3">
          {!editUser && (
            <Input
              label="Username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="e.g. mustafa"
              required
            />
          )}
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="e.g. Mayega Mustafa"
          />
          <div>
            <label className="field-label">Role <span className="text-danger">*</span></label>
            <select
              className="field-input"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              disabled={editUser?.id === currentUser?.id}
            >
              <option value="admin">Admin (full access)</option>
              <option value="accountant">Accountant (entries, cycles)</option>
              <option value="viewer">Viewer (read-only)</option>
            </select>
            {editUser?.id === currentUser?.id && (
              <p className="text-2xs text-ink-muted mt-1">You can't change your own role.</p>
            )}
          </div>
          {!editUser && (
            <Input
              label="Initial Password"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              hint="At least 4 characters. User will be forced to change it on first login."
              required
            />
          )}
          {editUser && editUser.id !== currentUser?.id && (
            <div>
              <label className="field-label">Status</label>
              <select
                className="field-input"
                value={form.is_active ? '1' : '0'}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.value === '1' }))}
              >
                <option value="1">Active</option>
                <option value="0">Disabled (cannot sign in)</option>
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!resetPwUserId}
        onClose={() => setResetPwUserId(null)}
        title="Reset User Password"
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setResetPwUserId(null)}>Cancel</Button>
          <Button onClick={handleResetPassword} loading={saving} disabled={newPw.length < 4}>Reset Password</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">
            Set a temporary password for this user. They will be forced to change it on their next login.
          </p>
          <Input
            label="Temporary Password"
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            hint="At least 4 characters"
            autoFocus
          />
        </div>
      </Modal>
    </Card>
  )
}

function previewAuditDetail(table, data) {
  if (!data) return ''
  if (table === 'entries') {
    return `${data.payee || ''} — ${data.purpose || ''} (UGX ${Number(data.amount || 0).toLocaleString()})`
  }
  if (table === 'imprest_cycles') {
    return data.name || `Cycle ${data.cycle_number || ''}`
  }
  if (table === 'terms') {
    return `Period ${data.term_number || ''}/${data.year || ''}`
  }
  if (table === 'categories' || table === 'signatories') {
    return data.name + (data.title ? ` (${data.title})` : '')
  }
  if (table === 'school_config') {
    return data.name || ''
  }
  return ''
}
