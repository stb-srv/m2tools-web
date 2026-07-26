import { test, expect } from '@playwright/test';

// Login -> Workspaces page -> create, auto-select, and delete a workspace.
// Exercises the real POST /api/workspaces, /api/workspaces/select and
// DELETE /api/workspaces/:id endpoints end-to-end (auth, ownership checks,
// storageService.initWorkspace side effects), not just the Vue component in
// isolation.
test('create a workspace, see it auto-activate, then delete it', async ({ page, request, baseURL }) => {
    const username = `wstest_${Date.now()}`;
    const password = 'SmokeTest123!';

    const registerRes = await request.post(`${baseURL}/api/auth/register`, {
        data: { username, email: `${username}@example.com`, password, passwordConfirm: password }
    });
    expect(registerRes.ok()).toBeTruthy();

    await page.goto('/login.html');
    await page.getByPlaceholder('Benutzername oder E-Mail').fill(username);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: 'Einloggen' }).click();
    await expect(page).toHaveURL(/\/index\.html$/);

    await page.goto('/workspaces.html');
    await expect(page.getByText('Noch keine Workspaces vorhanden.')).toBeVisible();

    const wsName = `Testprojekt ${Date.now()}`;
    await page.getByRole('button', { name: /Neuen Workspace anlegen/ }).click();
    await page.getByPlaceholder('Mein Projekt').fill(wsName);
    await page.getByRole('button', { name: 'Speichern' }).click();

    const wsCard = page.locator('.ws-card', { hasText: wsName });
    await expect(wsCard).toBeVisible();
    // The first workspace a user creates is auto-selected as active (see
    // workspaces/controller.js's create()), no explicit "Aktivieren" click needed.
    await expect(wsCard.getByText('AKTIV')).toBeVisible();

    await wsCard.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('button', { name: 'Ja' }).click();

    await expect(wsCard).not.toBeVisible();
    await expect(page.getByText('Noch keine Workspaces vorhanden.')).toBeVisible();
});
