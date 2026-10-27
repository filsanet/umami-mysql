# Single sign-on through an authenticating reverse proxy

Umami can trust identity headers set by a reverse proxy that has already authenticated the
user (corporate SSO). When a request carries those headers, Umami signs the matching user in
automatically, with no password or two-factor prompt.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_PROXY_USER_HEADER` | yes | Header holding the user id. Setting it turns the feature on. |
| `AUTH_PROXY_EMAIL_HEADER` | no | Header holding the email address, used as a second match. |
| `AUTH_PROXY_NAME_HEADER` | no | Header holding the display name, shown on the no-access page. |
| `AUTH_PROXY_ACCESS_URL` | no | Link shown to signed-in people who have no Umami account. |

Example for a proxy that sends `X-NOM-USER`, `X-NOM-MAIL` and `X-NOM-COMMON-NAME`:

```bash
AUTH_PROXY_USER_HEADER=X-NOM-USER
AUTH_PROXY_EMAIL_HEADER=X-NOM-MAIL
AUTH_PROXY_NAME_HEADER=X-NOM-COMMON-NAME
AUTH_PROXY_ACCESS_URL=https://intranet.example.com/how-to-get-umami-access
```

The feature is ignored when `CLOUD_MODE` is set.

## How users are matched

Umami looks for an existing user whose username equals the user id header, then one whose
username equals the email header. Usernames are lowercase in Umami, so the comparison is
case-insensitive. Umami never creates users from the headers: accounts, roles and team
membership are provisioned outside Umami (for example through the Umami API), using the
proxy user id or the email address as the username.

- **Match found:** the login page signs the user in and redirects to the dashboard.
- **Headers present, no match:** the login page shows a "no access yet" message with a link to
  `AUTH_PROXY_ACCESS_URL` (or "ask your administrator" when it is not set).
- **No headers:** the normal username and password form is shown, so local accounts such as
  the built-in admin still work when Umami is reached without the proxy.

Once signed in, every request is checked against the headers again. If the proxy reports a
different person than the one the session belongs to (for example on a shared browser), the
session is rejected and the new person is signed in from the headers instead. Requests
without the headers, such as API calls with an API key, are not affected.

Signing out returns to the login page, which signs the user straight back in while the proxy
still vouches for them. Sign out of the SSO provider to end the session completely.

## Security

Umami trusts these headers unconditionally once `AUTH_PROXY_USER_HEADER` is set. Only enable
it when:

1. Umami is reachable **only** through the authenticating proxy (bind it to a private network
   or localhost, or firewall it), and
2. the proxy **removes** any copy of these headers sent by the client before adding its own.

Otherwise anyone who can reach Umami directly can sign in as any user by sending the header.
