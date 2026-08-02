import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CasinoContext = createContext(null);

export function CasinoProvider({ children }) {
  const [activeGame, setActiveGame] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const openGame = useCallback((game) => {
    setActiveGame(game);
    setIsPlaying(false);
  }, []);

  const closeGame = useCallback(() => {
    setActiveGame(null);
    setIsPlaying(false);
  }, []);

  const startPlaying = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const stopPlaying = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const value = useMemo(() => ({
    activeGame,
    isPlaying,
    openGame,
    closeGame,
    startPlaying,
    stopPlaying,
  }), [activeGame, isPlaying, openGame, closeGame, startPlaying, stopPlaying]);

  return (
    <CasinoContext.Provider value={value}>
      {children}
    </CasinoContext.Provider>
  );
}

export function useCasino() {
  const context = useContext(CasinoContext);
  if (!context) throw new Error('useCasino must be used within CasinoProvider');
  return context;
}
