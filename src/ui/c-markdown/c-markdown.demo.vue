<script setup lang="ts">
const md = `
# IDC TOOLS

## About
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nisl quis
mollis blandit, nunc nisl aliquam nunc, vitae aliquam nisl nunc vitae nisl.

- Lorem ipsum dolor sit amet, consectetur adipiscing elit.
- Sed euismod, nisl quis mollis blandit, nunc nisl aliquam nunc, vitae aliquam nisl nunc vitae nisl.

[IDC TOOLS](https://it-tools.tech)
`;
</script>

<template>
  <c-markdown :markdown="md" />
</template>
