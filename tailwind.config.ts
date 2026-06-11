import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#030712',
        fortress: '#07111f',
        glass: 'rgba(13, 24, 45, 0.72)',
        solana: {
          violet: '#9945ff',
          green: '#14f195',
          cyan: '#67e8f9'
        },
        guardian: {
          text: '#edf7ff',
          muted: '#9fb0c7',
          amber: '#fbbf24',
          red: '#fb7185'
        }
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      boxShadow: {
        neon: '0 0 40px rgba(20, 241, 149, 0.2), 0 0 80px rgba(153, 69, 255, 0.16)',
        glass: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 24px 80px rgba(0,0,0,0.35)'
      },
      backgroundImage: {
        'solana-gradient': 'linear-gradient(135deg, #9945ff 0%, #14f195 100%)',
        'guardian-radial': 'radial-gradient(circle at 20% 20%, rgba(153,69,255,.26), transparent 28%), radial-gradient(circle at 80% 10%, rgba(20,241,149,.18), transparent 32%), linear-gradient(180deg, #030712 0%, #07111f 55%, #030712 100%)'
      }
    }
  },
  plugins: []
};

export default config;
