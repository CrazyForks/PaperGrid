'use client'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import { AdminNav } from './admin-nav'
import { NavigationDrawer } from './navigation-drawer'

export function AdminMobileSidebar({
  items,
}: {
  items: { href: string; iconName: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="lg:hidden">
      <NavigationDrawer
        open={open}
        onOpenChange={setOpen}
        title="创作终端"
        description="写作、整理与管理。"
        trigger={
          <button className="ba-icon-button" aria-label="打开侧栏">
            <Menu size={22} />
          </button>
        }
      >
        <AdminNav items={items} onLinkClick={() => setOpen(false)} />
      </NavigationDrawer>
    </div>
  )
}
