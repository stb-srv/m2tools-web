jest.mock('../server/config/database', () => ({ query: jest.fn() }));

const db = require('../server/config/database');
const controller = require('../server/modules/teams/controller');

function makeReqRes({ params = {}, body = {}, user = { id: 1, role: 'viewer' } } = {}) {
    const req = { params, body, user };
    const res = { json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
}

beforeEach(() => {
    db.query.mockReset();
});

describe('create', () => {
    test('rejects a missing name without hitting the database', async () => {
        const { req, res, next } = makeReqRes({ body: {} });
        await controller.create(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects a case-insensitive duplicate team name', async () => {
        db.query.mockResolvedValueOnce([[{ id: 9 }]]); // existing name match
        const { req, res, next } = makeReqRes({ body: { name: 'MyTeam' } });
        await controller.create(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('blocks a non-admin from exceeding their team limit', async () => {
        db.query
            .mockResolvedValueOnce([[]])                       // no name clash
            .mockResolvedValueOnce([[{ role: 'viewer' }]])      // requester role
            .mockResolvedValueOnce([[{ value: '2' }]])          // max_teams_per_user setting
            .mockResolvedValueOnce([[{ c: 2 }]]);               // already owns 2 teams
        const { req, res, next } = makeReqRes({ body: { name: 'NewTeam' } });
        await controller.create(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('lets an admin bypass the team limit entirely', async () => {
        db.query
            .mockResolvedValueOnce([[]])                  // no name clash
            .mockResolvedValueOnce([[{ role: 'admin' }]]) // requester is admin
            .mockResolvedValueOnce([{ insertId: 5 }])     // insert team
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert owner membership
        const { req, res, next } = makeReqRes({ body: { name: 'AdminTeam' } });
        await controller.create(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ success: true, id: 5 });
    });
});

describe('addMember', () => {
    test('rejects if the requester does not own the team', async () => {
        db.query.mockResolvedValueOnce([[]]); // not owner
        const { req, res, next } = makeReqRes({ body: { teamId: 4, username: 'alice' } });
        await controller.addMember(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('rejects a username that does not exist', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 4 }]]) // is owner
            .mockResolvedValueOnce([[]]);          // user lookup empty
        const { req, res, next } = makeReqRes({ body: { teamId: 4, username: 'ghost' } });
        await controller.addMember(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    test('enforces the max team member limit', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 4 }]])        // is owner
            .mockResolvedValueOnce([[{ id: 8 }]])        // user found
            .mockResolvedValueOnce([[{ value: '2' }]])   // max_team_members
            .mockResolvedValueOnce([[{ c: 2 }]]);        // already at capacity
        const { req, res, next } = makeReqRes({ body: { teamId: 4, username: 'alice' } });
        await controller.addMember(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(db.query).toHaveBeenCalledTimes(4); // never reaches the INSERT
    });
});

describe('removeMember', () => {
    test('lets a member remove themselves even without owning the team', async () => {
        db.query
            .mockResolvedValueOnce([[]])              // not the owner
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // delete
        const { req, res, next } = makeReqRes({ body: { teamId: 4, userId: 1 }, user: { id: 1 } });
        await controller.removeMember(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('blocks a non-owner from removing someone else', async () => {
        db.query.mockResolvedValueOnce([[]]); // not owner
        const { req, res, next } = makeReqRes({ body: { teamId: 4, userId: 99 }, user: { id: 1 } });
        await controller.removeMember(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
});

describe('deleteTeam', () => {
    test('rejects a non-owner, non-admin requester', async () => {
        db.query.mockResolvedValueOnce([[{ owner_id: 7 }]]);
        const { req, res, next } = makeReqRes({ body: { id: 4 }, user: { id: 1, role: 'viewer' } });
        await controller.deleteTeam(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('allows an admin to delete a team they do not own, unlinking workspaces', async () => {
        db.query
            .mockResolvedValueOnce([[{ owner_id: 7 }]])
            .mockResolvedValueOnce([{ affectedRows: 2 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 3 }]);
        const { req, res, next } = makeReqRes({ body: { id: 4 }, user: { id: 1, role: 'admin' } });
        await controller.deleteTeam(req, res, next);
        expect(next).not.toHaveBeenCalled();
        const workspaceUnlinkCall = db.query.mock.calls.find(c => c[0].includes('UPDATE workspaces'));
        expect(workspaceUnlinkCall).toBeTruthy();
    });
});
