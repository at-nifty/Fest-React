import { useState } from 'react'
import Component from './Component.jsx'

function App() {
  const [count, setCount] = useState(0)
  
  return (
    <>
      <Component message="Hello, React!"/>
      <Component message="Hello, JavaScript!"/>
    </>
  )
}

export default App
