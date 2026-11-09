import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, render, screen} from '@testing-library/react'
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom'
import {PublicRoute} from './ProtectedRoute'

const auth = vi.hoisted(() => ({isAuthenticated: false, isLoading: false, isInitialized: true}))
vi.mock('../contexts/AuthContext', () => ({useAuth: () => auth}))
afterEach(() => {cleanup();auth.isAuthenticated = false})

function Destination() {
  const location = useLocation()
  return <div>{location.pathname}{location.search}</div>
}

it('keeps the protected destination when authentication finishes on the login route', async () => {
  const app = () => <MemoryRouter initialEntries={[{pathname: '/login', state: {
    from: {pathname: '/workspace/project-1', search: '?intent=demo'},
  }}]}>
    <Routes>
      <Route path="/login" element={<PublicRoute><div>Login form</div></PublicRoute>} />
      <Route path="*" element={<Destination />} />
    </Routes>
  </MemoryRouter>
  const view = render(app())
  expect(screen.getByText('Login form')).toBeTruthy()
  auth.isAuthenticated = true
  view.rerender(app())
  expect(await screen.findByText('/workspace/project-1?intent=demo')).toBeTruthy()
})
