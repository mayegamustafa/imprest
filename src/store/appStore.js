import { create } from 'zustand'

const useAppStore = create((set, get) => ({
  // Auth
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  logout: async () => {
    await window.electronAPI.logout()
    set({
      currentUser: null,
      school: null,
      categories: [],
      signatories: [],
      activeCycleId: null,
      terms: [],
    })
  },
  hasRole: (...roles) => {
    const u = get().currentUser
    return u && roles.includes(u.role)
  },

  // School config
  school: null,
  setSchool: (school) => set({ school }),

  // Categories (all active)
  categories: [],
  setCategories: (categories) => set({ categories }),

  // Signatories
  signatories: [],
  setSignatories: (signatories) => set({ signatories }),

  // Active cycle context
  activeCycleId: null,
  setActiveCycleId: (id) => set({ activeCycleId: id }),

  // All terms (with cycles embedded)
  terms: [],
  setTerms: (terms) => set({ terms }),

  // Loading state
  globalLoading: false,
  setGlobalLoading: (v) => set({ globalLoading: v }),

  // Notification
  notification: null,
  notify: (message, type = 'success') => {
    set({ notification: { message, type, id: Date.now() } })
    setTimeout(() => set({ notification: null }), 3500)
  },

  // Bootstrap: load school + categories + signatories on startup
  bootstrap: async () => {
    try {
      const api = window.electronAPI
      const [school, categories, signatories, terms] = await Promise.all([
        api.getSchoolConfig(),
        api.getCategories(),
        api.getSignatories(),
        api.getTerms(),
      ])
      set({ school, categories: categories.filter(c => c.is_active), signatories, terms })

      // Auto-set active cycle to most recent active one
      const activeCycleId = get().activeCycleId
      if (!activeCycleId) {
        for (const term of terms) {
          const active = (term.cycles || []).find(c => c.status === 'active')
          if (active) {
            set({ activeCycleId: active.id })
            break
          }
        }
      }
    } catch (err) {
      console.error('Bootstrap error:', err)
    }
  },

  refreshTerms: async () => {
    const terms = await window.electronAPI.getTerms()
    set({ terms })
    // Re-validate active cycle
    const { activeCycleId } = get()
    let stillExists = false
    for (const term of terms) {
      if ((term.cycles || []).some(c => c.id === activeCycleId)) {
        stillExists = true
        break
      }
    }
    if (!stillExists) {
      // Find a new active cycle
      for (const term of terms) {
        const active = (term.cycles || []).find(c => c.status === 'active')
        if (active) { set({ activeCycleId: active.id }); break }
      }
    }
  },

  refreshCategories: async () => {
    const categories = await window.electronAPI.getCategories()
    set({ categories: categories.filter(c => c.is_active) })
  },
}))

export default useAppStore
