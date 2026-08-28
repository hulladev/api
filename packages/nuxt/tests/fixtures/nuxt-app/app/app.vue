<script setup lang="ts">
const api = useApi()
const name = ref('Grace')
const renamed = ref<string>()
const { data: health } = await useAsyncData('health', async (_nuxtApp, { signal }) => {
  const result = await api.health({ signal })
  if (result.status !== 200) throw new Error(`Unexpected health status: ${result.status}`)
  return result.body
})

async function rename() {
  const result = await api.rename({ body: { name: name.value } })
  if (result.status !== 200) throw new Error(`Unexpected rename status: ${result.status}`)
  renamed.value = result.body.name
}
</script>

<template>
  <main>
    <p>@hulla/api Nuxt fixture: {{ health?.ok }} as {{ health?.actor }}</p>
    <form @submit.prevent="rename">
      <input v-model="name" />
      <button>Rename</button>
    </form>
    <p v-if="renamed">Renamed to {{ renamed }}</p>
  </main>
</template>
