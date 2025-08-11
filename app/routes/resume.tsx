import { useEffect, useState } from "react";
import {Link, useParams ,useNavigate} from "react-router"
import { usePuterStore } from "~/lib/puter";

export const meta : any = () =>( [
    {title: 'Resumid | Review' },
    {name: 'description', content: 'Detailed Overview of Your Resume.'},
])

const Resume = () => {
    const {auth , isLoading,fs,kv} = usePuterStore();
    const { id } = useParams();
    const [resumeUrl, setResumeUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [feedback, setFeedback] = useState('');

    const navigate = useNavigate();

    useEffect(()=>
    {
        const loadResume = async () => {
           const resume = await kv.get(`/resumes/${id}`);
           if(!resume) return;

           const data=JSON.parse(resume);

           const resumeBlob = await fs.read(data.resumePath);
           if(!resumeBlob) return;

           const pdfBlob = new Blob([resumeBlob], { type: 'application/pdf' });
           const resumeUrl = URL.createObjectURL(pdfBlob);

           setResumeUrl(resumeUrl);
            const imageBlob = await fs.read(data.imagePath);
            if(!imageBlob) return;

            const imageUrl = URL.createObjectURL(imageBlob);
            setImageUrl(imageUrl);

            setFeedback(data.feedback);

            console.log({imageUrl, resumeUrl, feedback:data.feedback});
            console.log('Loading resume with ID:', id);
            console.log('Resume data:', data);
            console.log('Image blob size:', imageBlob?.size);
        }

        loadResume();
    },[id]);

  return (
   <main className="!pt-0">
     <nav>
         <Link to="/" className="back-button">  
            <img src= "icons/back.svg" alt="logo" className="w-2.5 h-2.5"/>    
            <span className="text-gray-800 text-sm font-semibold">Back To HomePage</span>  
         </Link>
     </nav>
     <div className="flex flex-row w-full max-lg:flex-col-reverse">
        <section className="feedback-section bg-[url('/images/bg-small.svg')] bg-cover h-[100vh] sticky top-0 flex items-center justify-center">
            {imageUrl && resumeUrl && (
                <div className="animate-in fade-in duration-1000 gradient-border max-sm:m-0 h-[90%] max-xl:h-fit w-fit">
                        <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                            <img src={imageUrl} alt="Resume Preview" 
                            className=" w-full h-full object-contain rounded-2xl"
                            title = "resume" 
                            />
                        </a>
                </div>
            )}
        </section>
     </div>
   </main>
  )
}

export default Resume