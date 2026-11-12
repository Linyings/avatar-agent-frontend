// The studio UI carries the AvaSpeak.ai brand, never the template's old name.
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {MemoryRouter} from 'react-router-dom'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {StudioShell} from './StudioShell'

vi.mock('./Studio.module.css',()=>({default:{}}))
vi.mock('@/features/auth',()=>({useAuth:()=>({user:null})}))
vi.mock('./studioService',()=>({getPackages:vi.fn(async()=>[]),mediaBlob:vi.fn()}))
afterEach(cleanup)

it('shows the AvaSpeak.ai brand in the shell',()=>{
 render(<MantineProvider><MemoryRouter><StudioShell><div/></StudioShell></MemoryRouter></MantineProvider>)
 expect(screen.getByRole('link',{name:'AvaSpeak.ai 首页'})).toBeVisible()
 expect(screen.getByText('AvaSpeak Studio')).toBeVisible()
 expect(document.body.textContent).not.toMatch(/flova/i)
})

it('studio sources and the page title no longer mention Flova',()=>{
 for(const file of ['StudioShell.tsx','StudioHome.tsx','StudioWorkspace.tsx'])
  expect(readFileSync(resolve(__dirname,file),'utf8')).not.toMatch(/flova/i)
 expect(readFileSync(resolve(__dirname,'../../../index.html'),'utf8')).not.toMatch(/flova/i)
})
