#!/usr/bin/env node
/** Private pipe worker for the repository's real, lockfile-pinned Auth SDK.
 * No secret is accepted in arguments, environment, files or console logs.
 * The parent captures stdout privately; only its fixed-code receipt is public.
 */
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

const actions = new Set(['enroll', 'challengeAndVerify', 'unenroll', 'refreshSession', 'assurance', 'user', 'signOut'])
const ownedPorts = new Set(['55431', '55531'])

export function ownedAuthUrl(value, project, request = false) {
  const url = new URL(value)
  if (typeof project !== 'string' || !/^tc-recovery-[a-f0-9]{10}-[a-z]+$/.test(project)
    || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !ownedPorts.has(url.port)
    || url.username || url.password || url.hash
    || (request ? !url.pathname.startsWith('/auth/v1/') : (url.pathname !== '/' || url.search))) {
    throw new Error('refuse_nonisolated_native_auth_target')
  }
  return url
}

export async function run(input) {
  ownedAuthUrl(input.url, input.project)
  if (!actions.has(input.action) || typeof input.publicKey !== 'string') {
    throw new Error('refuse_unknown_native_auth_operation')
  }
  const localFetch = (url, init) => {
    ownedAuthUrl(String(url), input.project, true)
    return fetch(url, { ...init, redirect: 'error' })
  }
  const client = createClient(input.url, input.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: localFetch },
  })
  let result
  if (input.action === 'refreshSession') {
    // Refresh remains possible when native unenrollment invalidates the old JWT.
    result = await client.auth.refreshSession({ refresh_token: input.session.refresh_token })
  } else {
    const seeded = await client.auth.setSession(input.session)
    if (seeded.error) return { error: safeError(seeded.error) }
    switch (input.action) {
      case 'enroll':
        result = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'TruckControl isolated acceptance',
          ...(input.data?.friendlyName ? { friendlyName: input.data.friendlyName } : {}) })
        break
      case 'challengeAndVerify':
        result = await client.auth.mfa.challengeAndVerify(input.data)
        break
      case 'unenroll':
        result = await client.auth.mfa.unenroll(input.data)
        break
      case 'assurance':
        result = await client.auth.mfa.getAuthenticatorAssuranceLevel(input.session.access_token)
        break
      case 'user':
        result = await client.auth.getUser(input.session.access_token)
        break
      case 'signOut':
        result = await client.auth.signOut({ scope: 'global' })
        break
    }
  }
  return result.error ? { error: safeError(result.error) } : { data: result.data }
}

function safeError(error) {
  return { status: Number.isInteger(error.status) ? error.status : null,
    code: typeof error.code === 'string' && /^[a-z0-9_]{1,80}$/.test(error.code) ? error.code : 'native_auth_error' }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    if (process.stdin.isTTY || process.stdout.isTTY) throw new Error('private_parent_pipe_required')
    let raw = ''
    for await (const part of process.stdin) {
      raw += part
      if (raw.length > 131072) throw new Error('native_auth_input_too_large')
    }
    const result = await run(JSON.parse(raw))
    // Never run this worker from a terminal: stdout is a private parent pipe.
    process.stdout.write(JSON.stringify(result))
  } catch {
    process.stderr.write('native_auth_worker_failed\n')
    process.exitCode = 1
  }
}
