import { test, expect } from '@playwright/test';

// Login -> dashboard -> cube_editor (public module). Catches
// router/guard/static-serving integration bugs that unit tests can't
// (e.g. the missing public/dist static mount found during the Vue
// cutover, which unit tests would never have caught).
test('login, dashboard renders, and a public module loads with its API call', async ({ page, request, baseURL }) => {
    const username = `smoketest_${Date.now()}`;
    const password = 'SmokeTest123!';

    const registerRes = await request.post(`${baseURL}/api/auth/register`, {
        data: {
            username,
            email: `${username}@example.com`,
            password,
            passwordConfirm: password
        }
    });
    expect(registerRes.ok()).toBeTruthy();
    const registerBody = await registerRes.json();
    expect(registerBody.success).toBe(true);

    const apiResponses = [];
    page.on('response', (resp) => {
        if (resp.url().includes('/api/')) apiResponses.push({ url: resp.url(), status: resp.status() });
    });
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/login.html');
    await page.getByPlaceholder('Benutzername oder E-Mail').fill(username);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: 'Einloggen' }).click();

    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(page.getByRole('heading', { name: /M2 TOOLS/ })).toBeVisible();

    await expect
        .poll(() => apiResponses.some(r => r.url.includes('/api/auth/modules/status')))
        .toBe(true);

    await page.locator('a.m2-sub-nav-item', { hasText: 'Cube Editor' }).click();
    await expect(page).toHaveURL(/\/modules\/cube_editor\/index\.html$/);
    await expect(page.getByRole('heading', { name: /CUBE/ })).toBeVisible();
    await expect(page.getByText('Aktuelle Rezepte')).toBeVisible();

    await expect
        .poll(() => apiResponses.some(r => r.url.includes('/api/cube/load')))
        .toBe(true);

    const cubeLoad = apiResponses.find(r => r.url.includes('/api/cube/load'));
    expect(cubeLoad.status).toBe(200);

    expect(consoleErrors).toEqual([]);
});
