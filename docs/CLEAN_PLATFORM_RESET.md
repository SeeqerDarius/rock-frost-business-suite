# Clean platform reset

`npm run db:reset-platform` is a deliberately guarded destructive bootstrap utility. It:

1. verifies that it is connected to a named database and the `public` schema;
2. discovers and truncates every application table while retaining `_prisma_migrations`;
3. reseeds the canonical system permissions, roles, role grants, and module registry;
4. creates one empty platform anchor organization; and
5. creates separate fresh `Super Admin` and `Organization Owner` identities.

It does not create demo tenants, demo module data, subscriptions, requests, notifications, or audit history.

The command refuses to run unless the operator supplies the exact one-time confirmation variable:

```powershell
$env:CONFIRM_DATABASE_RESET="DELETE_ALL_PLATFORM_DATA"
npm run db:reset-platform
Remove-Item Env:CONFIRM_DATABASE_RESET
```

Fresh passwords are randomly generated, printed once, and stored only as bcrypt hashes. Never copy the plaintext credentials into this repository or documentation. Change both passwords after first login.

The catalog seed uses bulk inserts for permissions and role grants. This is important on remote databases: a sequential grant-per-query seed can exceed normal operator command timeouts after the destructive truncation has already completed.
