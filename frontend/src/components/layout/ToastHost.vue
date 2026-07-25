<script setup>
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
</script>

<template>
    <div id="m2-toast-container" class="m2-toast-container">
        <div
            v-for="t in ui.toasts"
            :key="t.id"
            class="m2-toast"
            :class="t.type"
            @click="ui.dismissToast(t.id)"
        >
            <span class="m2-toast-icon">{{ icons[t.type] || 'ℹ️' }}</span>
            <span class="m2-toast-msg">{{ t.message }}</span>
        </div>
    </div>
</template>
