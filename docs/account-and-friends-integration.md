# Classic Era: account and friends integration decision

## Current decision

The app can keep a **local display name** for room membership today. This name is suitable for a lobby but is not an account and must not be treated as an identity, a friend relationship, or an entitlement record.

## Production account model

The recommended production path is email sign-in first, with Facebook as an optional second identity provider. One internal user ID must be created after either provider succeeds; friend requests and room invitations should reference that ID, never a display name or a room code.

| Capability | Required before implementation | Status |
|---|---|---|
| Email sign-in | Chosen authentication provider, verified Android redirect URI, outbound email configuration | Not configured |
| Facebook sign-in | Facebook App ID, App Secret stored only in server secrets, configured OAuth redirect URI, Facebook Login product enabled | Not configured |
| Friends | Authenticated internal user ID, server-side friend-request tables and authorization rules | Not configured |
| Room invite | Authenticated sender/receiver relationship and notification route | Not configured |

## Security constraints

- Never bundle a Facebook App Secret in the APK.
- Do not rely on a display name as a unique user identity.
- Friend lists, request status, and invite permissions must be checked by the server.
- Room codes are invitation credentials and must not be returned by public-lobby discovery.

## Next implementation step

After Facebook credentials and the preferred email provider are supplied, add the provider configuration through managed secrets, verify the redirect on a real Android package, create the friends schema through a reviewed migration, and enable a friends tab with sent/received request states.
