import {useState, type FormEvent,} from 'react'
import { Navbar } from "../components/Navbar";
import { Form, Navigate, useNavigate } from 'react-router';
import Fileuploader from '~/components/Fileuploader';
import { usePuterStore } from '~/lib/puter';
import { convertPdfToImage } from '~/lib/pdf2img';

import { generateUUID } from '~/lib/utils';
// import prepareInstructions from the correct path
import { prepareInstructions } from 'constants/';
 const upload = () => {
    const {auth , isLoading , fs,ai,kv} = usePuterStore();
    const navigate = useNavigate();
   const [isProcessing, setIsProcessing] = useState(false);
   const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleFileSelect = (file: File | null) => {
        setFile(file);
        
    }
    const handleAnalyze = async ({ companyName, jobTitle, jobDescription, file }: {
      companyName: string;
      jobTitle: string;
      jobDescription: string;
      file: File;
    }) => {
      try {
        setIsProcessing(true);
        setStatusText('Uploading The Resume...');

        const uploadedFile = await fs.upload([file]);

        if(!uploadedFile) return setStatusText('File upload failed. Please try again.');

        setStatusText("Converting To Image...");
        const imageFile = await convertPdfToImage(file);


        if(!imageFile.file) return setStatusText('File conversion failed. Please try again.');

        setStatusText(" Uploading The image...");
        const uploadedImage = await fs.upload([imageFile.file]);
        if(!uploadedImage) return setStatusText('Image upload failed. Please try again.');

        setStatusText("Preparing Data ...");

        const uuid = generateUUID();
        const data= {
          id:uuid,
          resumePath:uploadedFile.path,
          imagePath:uploadedImage.path,
          companyName,
          jobTitle,
          jobDescription,
          feedback:''
        }
        await kv.set(`resume:${uuid}`, JSON.stringify(data));

        setStatusText("Analyzing Resume...");
        const feedback = await ai.feedback(
            uploadedFile.path,
            prepareInstructions({ jobTitle, jobDescription })
        );
        if (!feedback) return setStatusText("Error: Failed to analyze resume");

        const feedbacktext = typeof feedback.message.content === 'string'
            ? feedback.message.content
            : feedback.message.content[0].text;

        // Instead of parsing the feedback directly, check if it's valid JSON
        try {
            data.feedback = JSON.parse(feedbacktext);
        } catch (error) {
            // If parsing fails, store the feedback as a string
            data.feedback = feedbacktext;
            console.log('Feedback is not in JSON format:', feedbacktext);
        }

        await kv.set(`/resumes/${uuid}`, JSON.stringify(data));
        setStatusText("Analysis complete, redirecting...");
        
        // Add navigation after successful analysis
        navigate(`/resume/${uuid}`);

    } catch (error) {
        console.error('Analysis error:', error);
        setStatusText('An error occurred during analysis');
    }
    }

    const handleSubmit=(e: FormEvent<HTMLFormElement>)=>{
      e.preventDefault();
      const form=e.currentTarget.closest('form');
      if(!form) return ;
      const formData = new FormData(form);

      const companyName = formData.get('company-name') as string;
      const  jobTitle = formData.get('job-title')as string;
      const jobDescription = formData.get('job-description')as string;
      
      if (!file) return;
      handleAnalyze({ companyName ,jobTitle , jobDescription , file });

    }

  return (  
    <main className = "bg-[url('/images/bg-main.svg')] bg-cover">
       <Navbar/>
         <section className="main-section">
            <div className='page-heading py-16'>
                <h1>Feedback for your dream Job</h1>
                {isProcessing ? (
                    <>
                        <h2> {statusText}</h2>
                        <img src="/images/resume-scan.gif" className="w-full" />
                    </>
                ) : (
                    <h2>Drop  your resume For An ATS Score And Improvment Steps </h2>
                )}
                {!isProcessing && (
                    <Form id="upload-form" onSubmit={handleSubmit}  className='flex flex col-gap-4 mt-8'>
                       <div className='form-div' >
                            <label htmlFor='company-name' >Company Name </label>
                            <input type="text" name="company-name" placeholder='Company Name ' id='company-name' />
                       </div>
                       <div className='form-div' >
                            <label htmlFor='job-title' >Job Title </label>
                            <input type="text" name="job-title" placeholder='Job Title ' id='job-title' />
                       </div>
                       <div className='form-div' >
                            <label htmlFor='job-description' >Job  Description </label>
                            <textarea name="job-description" placeholder='Write Clean & Concise job Desciption  with responsibilties & exceptions..' id='job-description' />
                       </div>
                       <div className='form-div' >
                            <label htmlFor='uploader' > Upload Resume </label>
                            <Fileuploader onFileselect={handleFileSelect} />
                       </div>
                       <button className='primary-button' type='submit'> Analyze Resume</button>
                    </Form>
                )}
            </div>
         </section>
    </main>
  )
}

export default upload