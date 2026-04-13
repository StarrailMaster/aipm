import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loginApi, registerApi, getMeApi } from '@/api/auth'
import { getToken, setToken, removeToken } from '@/api/request'

interface UserInfo {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
  squadId?: string | null
  squadName?: string | null
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<UserInfo | null>(null)

  async function login(email: string, password: string) {
    const res = await loginApi({ email, password })
    const data = res.data.data!
    token.value = data.token
    user.value = data.user
    setToken(data.token)
  }

  async function register(email: string, password: string, name: string) {
    const res = await registerApi({ email, password, name })
    const data = res.data.data!
    token.value = data.token
    user.value = data.user
    setToken(data.token)
  }

  async function fetchUser() {
    const res = await getMeApi()
    user.value = res.data.data!
  }

  function logout() {
    token.value = null
    user.value = null
    removeToken()
  }

  const isLoggedIn = () => !!token.value

  return {
    token,
    user,
    login,
    register,
    fetchUser,
    logout,
    isLoggedIn,
  }
})
