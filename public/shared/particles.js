/**
 * M2-Tools – Global Particle Engine
 * Subtle, slow-moving canvas particles that react to theme.
 */
(function () {
    'use strict';

    class M2Particles {
        constructor() {
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.particles = [];
            this.count = 90;
            this.resize();
            
            this.canvas.id = 'm2-particles-canvas';
            this.canvas.style.position = 'fixed';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.zIndex = '-8'; // Above background, below content
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.opacity = '0.4';
            
            document.body.appendChild(this.canvas);
            
            window.addEventListener('resize', () => this.resize());
            window.addEventListener('m2-theme-changed', () => this.initParticles());

            this.initParticles();
            this.animate();
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.initParticles();
        }

        initParticles() {
            this.particles = [];
            const theme = document.documentElement.getAttribute('data-theme') || 'dark';
            const color = theme === 'dark' ? '195, 163, 74' : '184, 134, 11'; // Gold for both themes 

            for (let i = 0; i < this.count; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * 0.4, // Slow
                    vy: (Math.random() - 0.5) * 0.4, // Slow
                    radius: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.5 + 0.1,
                    color: color
                });
            }
        }

        animate() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = this.canvas.width;
                if (p.x > this.canvas.width) p.x = 0;
                if (p.y < 0) p.y = this.canvas.height;
                if (p.y > this.canvas.height) p.y = 0;

                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
                this.ctx.fill();
            });

            requestAnimationFrame(() => this.animate());
        }
    }

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new M2Particles());
    } else {
        new M2Particles();
    }

})();
