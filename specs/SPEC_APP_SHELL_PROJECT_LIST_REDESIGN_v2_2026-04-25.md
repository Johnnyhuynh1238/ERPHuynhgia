# SPEC: Danh Sách Dự Án + App Shell Redesign

Version: 2.0
Ngày: 2026-04-25

## Review notes before implementation

- Spec is consistent overall.
- Internal contradiction resolved: file list mentions `components/protected-layout.tsx ← thêm avatarUrl`, but PHẦN 2 says no change needed because AppShell uses `user.name` initials. Follow PHẦN 2: do not change protected-layout unless build reveals a type requirement.
- Bottom bar on every breakpoint may overlap desktop UI; spec explicitly accepts it, so keep it visible and add enough bottom padding to main content.
- Removing “Hồ sơ” from nav must not remove `/profile` route; profile remains accessible from avatar dropdown.
- Project list redesign is UI-only; do not change project API.
- No migration/API changes required.

## Files cần sửa

- `components/app-shell.tsx`
- `app/projects/_components/projects-client.tsx`

## Required changes

### AppShell

1. Header:
- Remove visible header logout button on all breakpoints.
- Keep md user name/role display.

2. Mobile menu:
- Convert current mobile block sidebar into overlay + slide-out panel.
- Panel: fixed left/top, z-50, h-full, w-1/2, translate-x transition.
- Overlay: fixed inset-0 z-40 bg-black/60 md:hidden, click closes.
- X button in panel closes.
- Menu link click closes.
- Desktop sidebar remains static and unaffected.

3. ROLE_MENUS:
- Remove `{ label: "Hồ sơ", href: "/profile" }` from all roles:
  - admin
  - engineer
  - foreman
  - accountant
  - construction_manager

4. Bottom user bar:
- Fixed bottom, visible all breakpoints.
- Shows initials from user.name, name, role.
- Clicking toggles dropdown above with:
  - `Hồ sơ của tôi` -> `/profile`
  - `Đăng xuất` -> `signOut({ callbackUrl: "/login" })`
- Dropdown closes when selecting item or clicking outside.
- Add `pb-16` (or equivalent) to main content so bottom bar does not cover page.
- `getInitials` helper outside component.

### Projects client

- Replace table view with list cards.
- Each project row/link displays:
  - project.name (line 1, truncate)
  - project.address (line 2, truncate)
  - right arrow `›`
- Keep:
  - Search input
  - Status filter
  - GĐ quản lý / KS chính filters for `canViewAllProjects`
  - Pagination
  - Admin “Tạo dự án mới”
  - Title “Danh sách dự án”
  - existing fetch/API logic
- Remove unused imports/helpers:
  - `Progress`
  - `formatMoney`
  - `statusLabel`
  - `statusBadgeClass`
  - `canViewFinancial` if no longer used

## Smoke checklist

- Build passes: `npm run -s build`
- Type check passes: `npx tsc --noEmit --pretty false`
- Static/UI verification:
  - Header logout button removed.
  - Mobile overlay and slide-out classes present.
  - Profile removed from ROLE_MENUS.
  - Bottom bar + avatar dropdown present.
  - Main has bottom padding.
  - Projects table removed and list links present.
  - No horizontal table scroll remains.
- Deploy production with standard Docker compose command.
- Verify `/login` returns 200 and `/` redirects to login.
- Regenerate/update `PROJECT_STRUCTURE.md` with these changes and send file to user.
