<script setup>
import { ref, watch, nextTick } from 'vue';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const promptValue = ref('');

watch(() => ui.modal, (m) => {
    if (m && m.type === 'prompt') {
        promptValue.value = m.defaultValue || '';
        nextTick(() => {
            const input = document.getElementById('m2-prompt-input');
            if (input) { input.focus(); input.select(); }
        });
    }
});

function closeCancel() {
    if (!ui.modal) return;
    ui.closeModal(ui.modal.type === 'confirm' ? false : null);
}

function closeConfirm() {
    if (!ui.modal) return;
    if (ui.modal.type === 'prompt') ui.closeModal(promptValue.value);
    else if (ui.modal.type === 'confirm') ui.closeModal(true);
    else ui.closeModal(undefined);
}

function onOverlayClick(e) {
    if (e.target === e.currentTarget) closeCancel();
}
</script>

<template>
    <div v-if="ui.modal" class="m2-overlay" @click="onOverlayClick">
        <div class="m2-modal">
            <h3 class="m2-modal-title">{{ ui.modal.title }}</h3>
            <div class="m2-modal-body">
                <p v-if="ui.modal.type === 'prompt'" style="margin-bottom:15px; color:var(--text-secondary)">{{ ui.modal.message }}</p>
                <template v-else>{{ ui.modal.message }}</template>
                <div v-if="ui.modal.type === 'prompt'" class="m2-field-group">
                    <input
                        id="m2-prompt-input"
                        v-model="promptValue"
                        type="text"
                        class="m2-input"
                        autocomplete="off"
                        @keydown.enter="closeConfirm"
                    >
                </div>
            </div>
            <div class="m2-modal-footer">
                <button v-if="ui.modal.type !== 'alert'" class="m2-btn m2-btn-secondary" @click="closeCancel">
                    {{ ui.modal.cancelText || 'Abbrechen' }}
                </button>
                <button class="m2-btn m2-btn-primary" @click="closeConfirm">
                    {{ ui.modal.okText || (ui.modal.type === 'prompt' ? 'Bestätigen' : 'OK') }}
                </button>
            </div>
        </div>
    </div>
</template>
