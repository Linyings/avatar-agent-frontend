import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readJsonFile<T>(fileName: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), fileName), 'utf8')) as T
}

describe('deployment config', () => {
  it('keeps EdgeOne configured for Vite SPA output', () => {
    const edgeone = readJsonFile<{
      routes: Array<{
        path: string
        rewrite?: string
        headers?: Record<string, string>
      }>
    }>('edgeone.json')

    expect(edgeone.routes).toContainEqual(expect.objectContaining({
      path: '/*',
      rewrite: '/index.html',
      headers: expect.objectContaining({
        'Cache-Control': 'public, max-age=0, must-revalidate'
      })
    }))
    expect(edgeone.routes).toContainEqual(expect.objectContaining({
      path: '/assets/*',
      headers: expect.objectContaining({
        'Cache-Control': 'public, max-age=31536000, immutable'
      })
    }))
  })

  it('supports Vercel deployment with the same build output and SPA fallback', () => {
    const vercel = readJsonFile<{
      framework: string
      installCommand: string
      buildCommand: string
      outputDirectory: string
      headers: Array<{
        source: string
        headers: Array<{ key: string, value: string }>
      }>
      rewrites: Array<{ source: string, destination: string }>
    }>('vercel.json')

    expect(vercel).toMatchObject({
      framework: 'vite',
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      outputDirectory: 'dist'
    })
    expect(vercel.rewrites).toContainEqual({
      source: '/(.*)',
      destination: '/index.html'
    })
    expect(vercel.headers).toContainEqual({
      source: '/assets/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable'
        }
      ]
    })
    expect(vercel.headers).toContainEqual({
      source: '/:path((?!assets/).*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate'
        }
      ]
    })
  })

  it('keeps backend API routing out of the frontend container', () => {
    const nginx = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8')
    expect(nginx).not.toContain('host.docker.internal')
    expect(nginx).not.toMatch(/location\s+\/api\/\s*\{/)
    expect(nginx).toContain('location /api/fish-audio-proxy/')
    expect(nginx).toContain('try_files $uri $uri/ /index.html;')
    expect(nginx).toContain('Cache-Control "public, immutable"')
  })

  it('builds production with the same-origin API base', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain('ARG VITE_API_BASE_URL=')
    expect(dockerfile).not.toContain('VITE_TOS_ACCESS_KEY_SECRET')
  })

  it('publishes and deploys the frontend after main passes verification', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release-acr.yml'), 'utf8')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('npm test -- --run')
    expect(workflow).toContain('npm run build')
    expect(workflow).toContain('docker/build-push-action@v7')
    expect(workflow).toContain('deploy-service.sh frontend')
    expect(workflow).toContain('concurrency:')
    expect(workflow).toContain('short_sha="$(printf \'%s\' "$GITHUB_SHA" | cut -c1-7)"')
    expect(workflow).not.toContain('needs.publish.outputs.image')
  })
})
