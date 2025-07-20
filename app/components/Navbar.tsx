import { Link } from "react-router"

export const Navbar = () => {
  return (
    <div className="navbar">
    <Link to="/">
       <p className="text-2xl font-bold text-gradient">Resume Analyzer</p>
    </Link>
    <Link to="/upload" className="primary-button w-fit">
        Upload Resume
    </Link>
    
    </div>
  )
}
