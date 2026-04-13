import Conf from 'conf'

interface CliConfig {
  serverUrl: string
  token: string
}

const config = new Conf<CliConfig>({
  projectName: 'aipm-cli',
  defaults: {
    serverUrl: 'http://localhost:3000',
    token: '',
  },
})

export function getConfig(): { serverUrl: string; token: string } {
  return {
    serverUrl: config.get('serverUrl'),
    token: config.get('token'),
  }
}

export function setToken(token: string): void {
  config.set('token', token)
}

export function getToken(): string {
  return config.get('token')
}

export function setServerUrl(url: string): void {
  config.set('serverUrl', url)
}

export function getServerUrl(): string {
  return config.get('serverUrl')
}
