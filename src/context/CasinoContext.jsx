import { createContext, useContext, useState, useCallback } from 'react';

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

  return (
    <CasinoContext.Provider value={{
      activeGame,
      isPlaying,
      openGame,
      closeGame,
      startPlaying,
      stopPlaying,
    }}>
      {children}
    </CasinoContext.Provider>
  );
}

export function useCasino() {
  const context = useContext(CasinoContext);
  if (!context) throw new Error('useCasino must be used within CasinoProvider');
  return context;
}
