export default function rejectDemoModeProductionPlugin() {
  return {
    name: 'reject-demo-mode-production',
    apply: 'build',
    configResolved(config) {
      const envDemo = process.env.VITE_DEMO_MODE === '1' || process.env.VITE_DEMO_MODE === 'true';
      if (config.mode === 'production' && envDemo) {
        throw new Error(
          'Refusing production build with VITE_DEMO_MODE=1. Client demo wallets must not ship.',
        );
      }
      if (config.mode === 'production' && process.env.VITE_FANTASY_JOIN_ENABLED === '1') {
        throw new Error(
          'Refusing production build with VITE_FANTASY_JOIN_ENABLED=1 until a licensed fantasy provider is wired.',
        );
      }
      if (config.mode === 'production' && process.env.VITE_CASINO_ENABLED === '1') {
        throw new Error(
          'Refusing production build with VITE_CASINO_ENABLED=1 until a licensed casino aggregator is wired.',
        );
      }
    },
  };
}
