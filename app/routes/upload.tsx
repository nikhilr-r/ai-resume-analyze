import {useState, type FormEvent,} from 'react'
import { Navbar } from "../components/Navbar";
import { Form, Navigate, useNavigate } from 'react-router';
import Fileuploader from '~/components/Fileuploader';
import { usePuterStore } from '~/lib/puter';
import { convertPdfToImage } from '~/lib/pdf2img';

import { generateUUID } from '~/lib/utils';
// import prepareInstructions from the correct path
import { prepareInstructions } from '../../constants/';

// Define the AIResponse type inline
interface AIResponse {
  index: number;
  message: {
    role: string;
    content: string | any[];
    refusal: null | string;
    annotations: any[];
  };
  logprobs: null | any;
  finish_reason: string;
  usage: {
    type: string;
    model: string;
    amount: number;
    cost: number;
  }[];
  via_ai_chat_service: boolean;
}

// Utility function for robust base64 conversion
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
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
      let imageUrl: string | undefined;
      
      try {
        // Check if file type is supported
        if (!file.type.includes('pdf') && !file.type.includes('text') && !file.type.includes('doc')) {
          return setStatusText('Unsupported file type. Please upload a PDF, DOC, or text file.');
        }

        setIsProcessing(true);
        setStatusText('Uploading The Resume...');

        const uploadedFile = await fs.upload([file]);

        if(!uploadedFile) return setStatusText('File upload failed. Please try again.');

        // Check if the uploaded file has content
        if (uploadedFile.size === 0) {
          return setStatusText('The uploaded file appears to be empty. Please check your file and try again.');
        }

        setStatusText("Converting To Image...");
        const imageFile = await convertPdfToImage(file);

        if(!imageFile.file) return setStatusText('File conversion failed. Please try again.');

        // Check if the converted image has content
        if (imageFile.file.size === 0) {
            return setStatusText('Image conversion failed - generated image is empty. Please try again.');
        }

        setStatusText(" Uploading The image...");
        const uploadedImage = await fs.upload([imageFile.file]);
        if(!uploadedImage) return setStatusText('Image upload failed. Please try again.');

        // Check if the uploaded image has content
        if (uploadedImage.size === 0) {
            return setStatusText('Uploaded image appears to be empty. Please try again.');
        }

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
        
        // Check if AI service is available
        if (!ai || !ai.chat) {
            console.error('AI service not available:', ai);
            return setStatusText("Error: AI service not available");
        }
        
        // Test the AI service with a simple request first
        try {
            console.log('Testing AI service with simple request...');
            const testResponse = await ai.chat(
                'Hello, this is a test message.',
                undefined, // no image
                false, // testMode
                {
                    model: 'gpt-4o',
                    temperature: 0.7,
                    max_tokens: 100
                }
            );
            console.log('AI service test response:', testResponse);
        } catch (testError) {
            console.error('AI service test failed:', testError);
            return setStatusText("Error: AI service is not responding. Please try again later.");
        }

        // Read the uploaded file content to send to AI
        const resumeContent = await fs.read(uploadedFile.path);
        if (!resumeContent) {
            return setStatusText("Error: Failed to read resume content");
        }

        console.log('File type:', file.type);
        console.log('File size:', file.size);
        console.log('Resume content loaded:', resumeContent);

        // Convert the resume content to text if it's a PDF
        let resumeText = '';
        
        if (file.type === 'application/pdf') {
            // For PDF files, we'll use the image conversion we already have
            // The AI can analyze the image version
            const imageBlob = await fs.read(uploadedImage.path);
            if (imageBlob) {
                try {
                    // Convert blob to base64 for AI analysis
                    let dataUrl: string;
                    
                    try {
                        // Use a proper base64 conversion method that handles binary data
                        const arrayBuffer = await imageBlob.arrayBuffer();
                        const uint8Array = new Uint8Array(arrayBuffer);
                        
                        // Use the utility function for robust base64 conversion
                        const base64String = arrayBufferToBase64(arrayBuffer);
                        dataUrl = `data:image/png;base64,${base64String}`;
                    } catch (base64Error) {
                        console.warn('Base64 conversion failed, trying alternative method:', base64Error);
                        
                        // Alternative method: convert to canvas and get data URL
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const img = new Image();
                            
                            // Create a promise to handle the image loading
                            const imageLoadPromise = new Promise<string>((resolve, reject) => {
                                img.onload = () => {
                                    try {
                                        canvas.width = img.width;
                                        canvas.height = img.height;
                                        ctx?.drawImage(img, 0, 0);
                                        const dataUrl = canvas.toDataURL('image/png', 0.8);
                                        resolve(dataUrl);
                                    } catch (error) {
                                        reject(error);
                                    }
                                };
                                img.onerror = () => reject(new Error('Failed to load image'));
                                img.src = URL.createObjectURL(imageBlob);
                            });
                            
                            dataUrl = await imageLoadPromise;
                            
                            // Clean up the blob URL
                            URL.revokeObjectURL(img.src);
                        } catch (canvasError) {
                            console.warn('Canvas conversion also failed:', canvasError);
                            
                            // Final fallback: try to process the PDF directly without image conversion
                            console.log('Trying direct PDF processing as final fallback...');
                            setStatusText("Image conversion failed, trying direct PDF analysis...");
                            
                            try {
                                // Try to extract text from the PDF directly
                                let pdfText = '';
                                try {
                                    pdfText = await resumeContent.text();
                                } catch (textError) {
                                    console.warn('Direct PDF text extraction failed:', textError);
                                    pdfText = 'PDF content could not be extracted as text';
                                }
                                
                                // Use the same detailed prompt for PDF analysis
                                const pdfAnalysisPrompt = `Please analyze this resume for ATS compatibility and provide improvement suggestions.

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}

Resume Content: ${pdfText}

Please provide analysis in this JSON format:
{
  "overallScore": number,
  "ATS": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string"}]
  },
  "toneAndStyle": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "content": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "structure": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "skills": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  }
}`;
                                
                                const pdfFeedback = await ai.chat(
                                    pdfAnalysisPrompt,
                                    undefined, // no image
                                    false, // testMode
                                    {
                                        model: 'gpt-4o',
                                        temperature: 0.7,
                                        max_tokens: 2000
                                    }
                                );
                                
                                if (pdfFeedback && pdfFeedback.message && pdfFeedback.message.content) {
                                    const feedbacktext = typeof pdfFeedback.message.content === 'string'
                                        ? pdfFeedback.message.content
                                        : pdfFeedback.message.content[0].text;
                                    
                                    // Clean the feedback text to remove markdown code blocks
                                    let cleanFeedbackText = feedbacktext;
                                    if (cleanFeedbackText.includes('```json')) {
                                        cleanFeedbackText = cleanFeedbackText.replace(/```json\s*/, '').replace(/\s*```$/, '');
                                    } else if (cleanFeedbackText.includes('```')) {
                                        cleanFeedbackText = cleanFeedbackText.replace(/```\s*/, '').replace(/\s*```$/, '');
                                    }
                                    
                                    try {
                                        data.feedback = JSON.parse(cleanFeedbackText);
                                    } catch (parseError) {
                                        data.feedback = cleanFeedbackText;
                                        console.log('PDF analysis feedback is not in JSON format:', cleanFeedbackText);
                                    }
                                } else {
                                    throw new Error('PDF analysis failed');
                                }
                                
                                return; // Skip the rest of the image processing
                            } catch (pdfError) {
                                console.error('Direct PDF analysis also failed:', pdfError);
                                throw new Error('All analysis methods failed');
                            }
                        }
                    }
                    
                    console.log('Sending image to AI for analysis...');
                    console.log('Instructions:', prepareInstructions({ jobTitle, jobDescription }));
                    console.log('Image data URL length:', dataUrl.length);
                    
                    // Check if the image data is too large (limit to 10MB)
                    if (dataUrl.length > 10 * 1024 * 1024) {
                        console.warn('Image data is very large, this might cause issues with the AI service');
                        setStatusText('Warning: Image is very large, analysis might take longer...');
                    }
                    
                    // If image is extremely large (>20MB), try to use text-only analysis
                    if (dataUrl.length > 20 * 1024 * 1024) {
                        console.warn('Image is extremely large, switching to text-only analysis');
                        setStatusText('Image too large, using text analysis instead...');
                        
                        // Try text-only analysis with the same detailed prompt
                        const textAnalysisPrompt = `Please analyze this resume for ATS compatibility and provide improvement suggestions.

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}

Since the image is too large to process, please provide analysis based on the job requirements and general resume best practices.

Please provide analysis in this JSON format:
{
  "overallScore": number,
  "ATS": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string"}]
  },
  "toneAndStyle": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "content": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "structure": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "skills": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  }
}`;
                        
                        const textFeedback = await ai.chat(
                            textAnalysisPrompt,
                            undefined, // no image
                            false, // testMode
                            {
                                model: 'gpt-4o',
                                temperature: 0.7,
                                max_tokens: 2000
                            }
                        );
                        
                        if (textFeedback && textFeedback.message && textFeedback.message.content) {
                            const feedbacktext = typeof textFeedback.message.content === 'string'
                                ? textFeedback.message.content
                                : textFeedback.message.content[0].text;
                            
                            // Clean the feedback text to remove markdown code blocks
                            let cleanFeedbackText = feedbacktext;
                            if (cleanFeedbackText.includes('```json')) {
                                cleanFeedbackText = cleanFeedbackText.replace(/```json\s*/, '').replace(/\s*```$/, '');
                            } else if (cleanFeedbackText.includes('```')) {
                                cleanFeedbackText = cleanFeedbackText.replace(/```\s*/, '').replace(/\s*```$/, '');
                            }
                            
                            try {
                                data.feedback = JSON.parse(cleanFeedbackText);
                            } catch (parseError) {
                                data.feedback = feedbacktext;
                                console.log('Text-only feedback is not in JSON format:', feedbacktext);
                            }
                        } else {
                            return setStatusText("Error: Text-only analysis failed");
                        }
                        
                        return; // Skip the image analysis
                    }
                    
                    // Add timeout for AI request
                    const aiPromise = ai.chat(
                        prepareInstructions({ jobTitle, jobDescription }),
                        dataUrl,
                        false, // testMode
                        {
                            model: 'gpt-4o', // Try using a different model
                            temperature: 0.7,
                            max_tokens: 2000
                        }
                    );
                    
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('AI request timed out')), 60000) // 60 seconds timeout
                    );
                    
                    const feedback = await Promise.race([aiPromise, timeoutPromise]) as AIResponse;
                    
                    if (!feedback) return setStatusText("Error: Failed to analyze resume");
                    
                    console.log('AI Response:', feedback);
                    
                    // Check if the response has the expected structure
                    if (!feedback.message || !feedback.message.content) {
                        console.error('Unexpected AI response structure:', feedback);
                        return setStatusText("Error: AI response format is unexpected");
                    }
                    
                    const feedbacktext = typeof feedback.message.content === 'string'
                        ? feedback.message.content
                        : feedback.message.content[0].text;
                    
                    console.log('Feedback text:', feedbacktext);
                    
                    // Clean the feedback text to remove markdown code blocks
                    let cleanFeedbackText = feedbacktext;
                    if (cleanFeedbackText.includes('```json')) {
                        cleanFeedbackText = cleanFeedbackText.replace(/```json\s*/, '').replace(/\s*```$/, '');
                    } else if (cleanFeedbackText.includes('```')) {
                        cleanFeedbackText = cleanFeedbackText.replace(/```\s*/, '').replace(/\s*```$/, '');
                    }
                    
                    console.log('Cleaned feedback text:', cleanFeedbackText);
                    
                    // Parse the feedback
                    try {
                        data.feedback = JSON.parse(cleanFeedbackText);
                        console.log('Successfully parsed feedback:', data.feedback);
                    } catch (error) {
                        // If parsing fails, store the feedback as a string
                        data.feedback = cleanFeedbackText;
                        console.log('Feedback parsing failed, storing as string:', error);
                    }
                } catch (error) {
                    console.error('Error processing image for AI:', error);
                    
                    // Fallback: try to extract text from the PDF directly
                    console.log('Image analysis failed, trying text extraction as fallback...');
                    try {
                        setStatusText("Image analysis failed, trying text extraction...");
                        
                        // Try to extract text from the PDF using a different approach
                        let pdfText = '';
                        try {
                            // Try to read the PDF as text first
                            pdfText = await resumeContent.text();
                        } catch (textError) {
                            console.warn('Direct text extraction failed:', textError);
                            // If that fails, try to use the PDF.js library approach
                            pdfText = 'PDF content could not be extracted as text';
                        }
                        
                        // Create a more detailed prompt for text-only analysis
                        const textAnalysisPrompt = `Please analyze this resume for ATS compatibility and provide improvement suggestions.

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}

Resume Content: ${pdfText}

Please provide analysis in this JSON format:
{
  "overallScore": number,
  "ATS": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string"}]
  },
  "toneAndStyle": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "content": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "structure": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "skills": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  }
}`;
                        
                        const textFeedback = await ai.chat(
                            textAnalysisPrompt,
                            undefined, // no image
                            false, // testMode
                            {
                                model: 'gpt-4o',
                                temperature: 0.7,
                                max_tokens: 2000
                            }
                        );
                        
                        if (textFeedback && textFeedback.message && textFeedback.message.content) {
                            const feedbacktext = typeof textFeedback.message.content === 'string'
                                ? textFeedback.message.content
                                : textFeedback.message.content[0].text;
                            
                            // Clean the feedback text to remove markdown code blocks
                            let cleanFeedbackText = feedbacktext;
                            if (cleanFeedbackText.includes('```json')) {
                                cleanFeedbackText = cleanFeedbackText.replace(/```json\s*/, '').replace(/\s*```$/, '');
                            } else if (cleanFeedbackText.includes('```')) {
                                cleanFeedbackText = cleanFeedbackText.replace(/```\s*/, '').replace(/\s*```$/, '');
                            }
                            
                            try {
                                data.feedback = JSON.parse(cleanFeedbackText);
                            } catch (parseError) {
                                data.feedback = cleanFeedbackText;
                                console.log('Fallback feedback is not in JSON format:', cleanFeedbackText);
                            }
                        } else {
                            return setStatusText("Error: Both image and text analysis failed");
                        }
                    } catch (fallbackError) {
                        console.error('Fallback text analysis also failed:', fallbackError);
                        return setStatusText("Error: Failed to analyze resume. Please try again.");
                    }
                }
            } else {
                return setStatusText("Error: Failed to read converted image");
            }
        } else {
            // For other file types, try to read as text
            try {
                resumeText = await resumeContent.text();
                console.log('Sending text to AI for analysis...');
                console.log('Instructions:', prepareInstructions({ jobTitle, jobDescription }));
                console.log('Resume text length:', resumeText.length);
                
                // Create a detailed prompt for text analysis
                const textAnalysisPrompt = `Please analyze this resume for ATS compatibility and provide improvement suggestions.

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}

Resume Content: ${resumeText}

Please provide analysis in this JSON format:
{
  "overallScore": number,
  "ATS": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string"}]
  },
  "toneAndStyle": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "content": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "structure": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  },
  "skills": {
    "score": number,
    "tips": [{"type": "good"|"improve", "tip": "string", "explanation": "string"}]
  }
}`;
                
                // Add timeout for AI request
                const aiPromise = ai.chat(
                    textAnalysisPrompt,
                    undefined, // no image
                    false, // testMode
                    {
                        model: 'gpt-4o',
                        temperature: 0.7,
                        max_tokens: 2000
                    }
                );
                
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('AI request timed out')), 60000) // 60 seconds timeout
                );
                
                const feedback = await Promise.race([aiPromise, timeoutPromise]) as AIResponse;
                
                if (!feedback) return setStatusText("Error: Failed to analyze resume");
                
                console.log('AI Response:', feedback);
                
                // Check if the response has the expected structure
                if (!feedback.message || !feedback.message.content) {
                    console.error('Unexpected AI response structure:', feedback);
                    return setStatusText("Error: AI response format is unexpected");
                }
                
                const feedbacktext = typeof feedback.message.content === 'string'
                    ? feedback.message.content
                    : feedback.message.content[0].text;
                
                console.log('Feedback text:', feedbacktext);
                
                // Clean the feedback text to remove markdown code blocks
                let cleanFeedbackText = feedbacktext;
                if (cleanFeedbackText.includes('```json')) {
                    cleanFeedbackText = cleanFeedbackText.replace(/```json\s*/, '').replace(/\s*```$/, '');
                } else if (cleanFeedbackText.includes('```')) {
                    cleanFeedbackText = cleanFeedbackText.replace(/```\s*/, '').replace(/\s*```$/, '');
                }
                
                console.log('Cleaned feedback text:', cleanFeedbackText);
                
                // Parse the feedback
                try {
                    data.feedback = JSON.parse(cleanFeedbackText);
                } catch (error) {
                    // If parsing fails, store the feedback as a string
                    data.feedback = cleanFeedbackText;
                    console.log('Feedback is not in JSON format:', cleanFeedbackText);
                }
            } catch (error) {
                console.error('Error reading file content:', error);
                return setStatusText("Error: Failed to read resume content");
            }
        }

        await kv.set(`resume:${uuid}`, JSON.stringify(data));
        console.log('Final data structure being saved:', data);
        console.log('Data saved to database with key:', `resume:${uuid}`);
        setStatusText("Analysis complete, redirecting...");
        
        // Clean up any created blob URLs
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }
        
        // Add navigation after successful analysis
        navigate(`/resume/${uuid}`);

    } catch (error) {
        console.error('Analysis error:', error);
        
        // Clean up any created blob URLs
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }
        
        // Provide more specific error messages
        if (error instanceof Error) {
            if (error.message.includes('network') || error.message.includes('fetch')) {
                setStatusText('Network error. Please check your internet connection and try again.');
            } else if (error.message.includes('timeout')) {
                setStatusText('Request timed out. Please try again.');
            } else if (error.message.includes('unauthorized')) {
                setStatusText('Authentication error. Please sign in again.');
            } else {
                setStatusText(`Analysis failed: ${error.message}`);
            }
        } else {
            setStatusText('An unexpected error occurred during analysis. Please try again.');
        }
        
        setIsProcessing(false);
    } finally {
        // Ensure processing state is reset
        setIsProcessing(false);
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
      
      // Validate form fields
      if (!companyName?.trim()) {
        setStatusText('Please enter a company name');
        return;
      }
      
      if (!jobTitle?.trim()) {
        setStatusText('Please enter a job title');
        return;
      }
      
      if (!jobDescription?.trim()) {
        setStatusText('Please enter a job description');
        return;
      }
      
      if (!file) {
        setStatusText('Please select a resume file');
        return;
      }
      
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