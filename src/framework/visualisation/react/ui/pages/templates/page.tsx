interface PageProps {
  body: JSX.Element
}

export const Page = (props: PageProps): JSX.Element => {
  return (
    <div className='w-full h-full p-4 sm:p-6 md:p-8 lg:p-10'>
      {props.body}
    </div>
  )
}
