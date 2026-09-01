import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [react()],
        // Set the server port to the value of VITE_PORT or you can set a default value (5176) if VITE_PORT is not defined
        server: { port: Number(env.VITE_PORT ?? 5176) },
    };
});