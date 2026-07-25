<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useThemeStore } from '@/stores/theme';

const theme = useThemeStore();
const canvasEl = ref(null);

let canvas, ctx, particles = [];
let animationFrame;
const COUNT = 90;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
}

function initParticles() {
    const color = theme.theme === 'dark' ? '195, 163, 74' : '184, 134, 11'; // Gold for both themes
    particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.5 + 0.1,
        color
    }));
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.fill();
    });
    animationFrame = requestAnimationFrame(animate);
}

watch(() => theme.theme, initParticles);

onMounted(() => {
    canvas = canvasEl.value;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    animate();
});

onBeforeUnmount(() => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
});
</script>

<template>
    <canvas ref="canvasEl" id="m2-particles-canvas" style="position:fixed; top:0; left:0; z-index:-8; pointer-events:none; opacity:0.4;"></canvas>
</template>
