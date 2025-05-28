import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'

function Page() {
  const [todos, setTodos] = useState([])

  useEffect(() => {
    async function getTodos() {
      try {
        const { data, error } = await supabase.from('todos').select()
        if (error) {
          console.error(error)
          return
        }
        if (data?.length > 0) {
          setTodos(data)
        }
      } catch (err) {
        console.error(err)
      }
    }
    getTodos()
  }, [])

  return (
    <div>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </div>
  )
}
export default Page
