import { useEffect, useState } from 'react'

import './App.css'
import { socket } from './socket'

function App() {
  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log("Connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected");
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  return(
    <main>
      
    </main>
  )
}

export default App
