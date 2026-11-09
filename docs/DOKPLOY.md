# Deploy Geo-Data API with Dokploy

This guide deploys the website, interactive demo, documentation and v2 API
from the GitHub repository using Dokploy's Docker Compose service. The build
generates the static dataset inside the image; no database or persistent volume
is required at runtime.

## Before you start

- A server with Dokploy and Docker working, and access to the Dokploy dashboard.
- A domain or subdomain such as `geo.example.com`, if you want HTTPS. Point an
  **A record** for it to the public IPv4 address of the server running the
  service. If an AAAA record exists, it must also point to a working IPv6
  address on that server.
- Inbound ports **80** and **443** reachable by Dokploy's Traefik proxy for
  domain routing and Let's Encrypt. Port **3000** is the application port
  inside the container; it does not need to be opened publicly.
- Several GB of free disk space, free inodes and enough memory for the build.
  The current dataset produces over 160,000 JSON files, and Docker retains build
  layers as well as the finished image. The first build can take several minutes.

The `db/` source files are already in the repository. You do not need to run
`npm install` or upload a generated `dist/` directory on the server.

## 1. Create the Compose service

1. Sign in to Dokploy and open an existing project, or create a project named
   `Geo-Data API`.
2. Add a **Compose** service. Choose **Docker Compose** as the Compose type,
   not Docker Stack: this configuration builds an image from the repository.
3. Choose the **GitHub** provider if your GitHub integration is configured, or
   the **Git** provider for the public repository. Select or enter:

   | Setting | Value |
   | --- | --- |
   | Repository | `https://github.com/azadshaikh/geo-data-api` |
   | Branch | `main`, or the branch containing the desired release |
   | Compose path | `./docker-compose.yml` |

4. Save the configuration. Leave the environment variables empty: the image
   already sets the host and port. Use the repository as the source so Docker
   can access the Dockerfile and dataset when it builds.

The supplied [Compose file](../docker-compose.yml) is:

```yaml
services:
  geo-data-api:
    build:
      context: .
      dockerfile: Dockerfile
    expose:
      - "3000"
    restart: unless-stopped
```

It does not publish a host port or contain domain-specific Traefik labels.
Dokploy adds the routing labels and network for the configured domain during
deployment. The separate root `compose.yaml` is for local preview and publishes
port 3000 on localhost; use `docker-compose.yml` in Dokploy.

## 2. Add a domain and HTTPS

Wait until the DNS record points to the server, then open the Compose service's
**Domains** tab and choose **Add Domain** or **Create Domain**. Set:

| Setting | Value |
| --- | --- |
| Host | `geo.example.com`, replaced with your domain |
| Service name | `geo-data-api` |
| Path | `/` |
| Container port | `3000` |
| HTTPS | On |
| Certificate | Let's Encrypt |

Save the domain. Dokploy's domain UI manages the proxy configuration, so you
do not need to add labels manually. If you change a Compose domain later,
redeploy the service for those routing changes to take effect. The optional
**Preview Compose** button shows the labels and network Dokploy will add.

For a temporary HTTP test without your own domain, Dokploy can generate a
`traefik.me` hostname. Use its generated-domain instructions and port `3000`;
the default generated domain uses HTTP with HTTPS off and no certificate.

## 3. Deploy and verify

1. Click **Deploy** and watch the **Deployments** logs. Docker builds the
   dataset, verifies the generated API and starts the website server. Wait for
   the build and container health check to finish.
2. Open these URLs, replacing `geo.example.com` with your domain:

   - `https://geo.example.com/` — home page
   - `https://geo.example.com/demo/demo.html` — interactive demo
   - `https://geo.example.com/docs/index.html` — API documentation
   - `https://geo.example.com/api/v2/countries.json` — country list
   - `https://geo.example.com/api/v2/cities/57995.json` — example city

3. Try selecting a country and state in the demo, then load a city. You can
   also check the API from a terminal:

   ```sh
   curl -fsS https://geo.example.com/api/v2/api-info.json
   curl -fsS https://geo.example.com/api/v2/countries/in/states.json
   ```

These URLs use a custom HTTPS domain. If you used a generated HTTP hostname,
replace both the hostname and `https` in the examples.

## Updating the deployment

Push your changes to the configured branch and click **Deploy** again, or set
up Dokploy's Git provider/webhook auto-deploy feature. A build reads the source
files in that commit and bakes the resulting API into a new image. To return to
an earlier version, select the earlier branch or commit supported by your Git
provider configuration and deploy it again. Avoid mounting over `/app/dist`:
the generated data is already inside the image and a mount can hide it.

For a local preview instead of Dokploy, run
`docker compose -f compose.yaml up --build -d` from the repository root and
open `http://127.0.0.1:3000`. Use `docker compose -f compose.yaml down` to stop
the local preview.

## Troubleshooting

- **Build fails or runs out of space:** inspect the deployment logs and check
  available memory, disk space and inodes. The full build generates many files
  and needs space for intermediate Docker layers.
- **Domain shows 404:** make sure the domain is attached to the Compose service
  `geo-data-api`, then redeploy after saving the domain. Check **Preview
  Compose** and the Traefik logs if routing is still missing.
- **502 Bad Gateway or an unhealthy container:** check the service logs and
  health status. The domain must target container port `3000`; the image listens
  on `0.0.0.0:3000` by default.
- **Certificate is not issued:** verify DNS points to the correct server and
  ports 80 and 443 are reachable. Check Traefik logs and Dokploy's certificate
  settings, then retry the domain configuration if needed.
- **The demo loads but API requests fail:** make sure the whole image was
  deployed, the domain path is `/`, and the URLs above work directly. Do not
  mount an empty directory over `/app/dist`.

Dokploy's UI can change between versions. See its official guides for
[Docker Compose](https://docs.dokploy.com/docs/core/docker-compose/example),
[Compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains),
and [domain troubleshooting](https://docs.dokploy.com/docs/core/troubleshooting/domains).
