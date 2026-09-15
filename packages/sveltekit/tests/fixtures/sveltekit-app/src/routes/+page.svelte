<script lang="ts">
  let { data } = $props()
  import { health, rename, renameForm } from './health.remote'
</script>

<main><span id="local-health">{data.initialHealth}</span>@hulla/api SvelteKit fixture: {await health()}</main>

<form {...renameForm}>
  <input {...renameForm.fields.name.as('text')} />
  <button>Rename with form</button>
</form>

<button type="button" onclick={() => rename({ name: 'Ada' })}>Rename with command</button>
