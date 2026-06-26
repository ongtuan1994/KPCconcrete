import { useState } from 'react'
import { Button, Field, Input } from '../components/ui'
import { Logo } from '../components/icons'
import { login, changePassword } from '../data/auth'

type Mode = 'login' | 'change'

/** Full-screen sign-in gate. Rendered by App whenever there is no session. */
export function Login() {
  const [mode, setMode] = useState<Mode>('login')

  return (
    <div className="login-screen">
      {mode === 'login'
        ? <LoginForm onChangePassword={() => setMode('change')} />
        : <ChangePasswordForm onBack={() => setMode('login')} />}
    </div>
  )
}

function Brand() {
  return (
    <div className="login-brand">
      <Logo size={44} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', color: 'var(--kpc-text-strong)' }}>KPC</span>
        <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>กิจไพศาลคอนกรีต</span>
      </div>
    </div>
  )
}

function LoginForm({ onChangePassword }: { onChangePassword: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    setErr('')
    if (!username.trim() || !password) {
      setErr('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
      return
    }
    const user = login(username, password)
    if (!user) setErr('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    /* On success the auth store flips `session`; App re-renders into the app. */
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <Brand />

      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 0', color: 'var(--kpc-text-strong)' }}>
        เข้าสู่ระบบ · Sign in
      </h1>
      <p style={{ fontSize: 13, color: 'var(--kpc-text-muted)', margin: '4px 0 8px' }}>
        ระบบจัดการโรงงานคอนกรีต — กรุณาเข้าสู่ระบบเพื่อใช้งาน
      </p>

      {err && (
        <div style={{ color: 'var(--kpc-danger)', fontSize: 13, background: 'var(--kpc-danger-bg)', padding: '8px 12px', borderRadius: 'var(--kpc-radius)' }}>
          {err}
        </div>
      )}

      <Field label="ชื่อผู้ใช้ · Username">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus autoComplete="username" />
      </Field>
      <Field label="รหัสผ่าน · Password">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" autoComplete="current-password" />
      </Field>

      <Button type="submit" variant="primary" size="lg" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
        เข้าสู่ระบบ
      </Button>
      <Button type="button" variant="secondary" size="lg" style={{ width: '100%', justifyContent: 'center' }} onClick={onChangePassword}>
        เปลี่ยนรหัสผ่าน
      </Button>
    </form>
  )
}

function ChangePasswordForm({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    setErr('')
    if (!username.trim() || !oldPassword || !newPassword) {
      setErr('กรุณากรอกข้อมูลให้ครบทุกช่อง')
      return
    }
    const error = changePassword(username, oldPassword, newPassword)
    if (error) { setErr(error); return }
    setOk(true)
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <Brand />

      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 0', color: 'var(--kpc-text-strong)' }}>
        เปลี่ยนรหัสผ่าน · Change password
      </h1>
      <p style={{ fontSize: 13, color: 'var(--kpc-text-muted)', margin: '4px 0 8px' }}>
        ระบุชื่อผู้ใช้ รหัสผ่านเดิม และรหัสผ่านใหม่
      </p>

      {ok ? (
        <>
          <div style={{ color: 'var(--kpc-success-ink)', fontSize: 13, background: 'var(--kpc-success-bg)', padding: '10px 12px', borderRadius: 'var(--kpc-radius)' }}>
            เปลี่ยนรหัสผ่านเรียบร้อยแล้ว — กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่
          </div>
          <Button type="button" variant="primary" size="lg" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={onBack}>
            กลับไปเข้าสู่ระบบ
          </Button>
        </>
      ) : (
        <>
          {err && (
            <div style={{ color: 'var(--kpc-danger)', fontSize: 13, background: 'var(--kpc-danger-bg)', padding: '8px 12px', borderRadius: 'var(--kpc-radius)' }}>
              {err}
            </div>
          )}

          <Field label="ชื่อผู้ใช้ · Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus autoComplete="username" />
          </Field>
          <Field label="รหัสผ่านเดิม · Old Password">
            <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="••••••" autoComplete="current-password" />
          </Field>
          <Field label="รหัสผ่านใหม่ · New Password">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" autoComplete="new-password" />
          </Field>

          <Button type="submit" variant="primary" size="lg" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            บันทึกรหัสผ่านใหม่
          </Button>
          <Button type="button" variant="secondary" size="lg" style={{ width: '100%', justifyContent: 'center' }} onClick={onBack}>
            ยกเลิก
          </Button>
        </>
      )}
    </form>
  )
}
