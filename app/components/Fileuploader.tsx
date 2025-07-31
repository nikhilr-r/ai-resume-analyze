import React, { useState } from 'react'
import { useCallback, } from 'react'
import { useDropzone } from 'react-dropzone'
import { formatSize } from '~/lib/utils';

interface FileUploaderProps {
    onFileselect?: (file: File | null) => void;
}

const Fileuploader = ({onFileselect} : FileUploaderProps) => {

    const onDrop = useCallback((acceptedFiles: File[]) => {
    const  file = acceptedFiles[0];
    onFileselect?.(file);

     
  }, [onFileselect]);
  const {getRootProps, getInputProps, isDragActive, acceptedFiles} = useDropzone({
            onDrop,
            multiple:false,
            accept: {'application/pdf': ['.pdf']},
            maxSize: 20 * 1024 * 1024
    })
    const file = acceptedFiles[0];
  
  return (
    <div className='w-full' gradient-border> 
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {
        <div className='space-y-r cursor-pointer'>
            {file? (
                <div className='uploader-selected-file onClick={(e) => {e.stopPropagation()}}'>
                <div className='Flex flex-col items-center space-x-3'>
                    <img src='/images/pdf.png' alt='pdf' className='size-10' />
                    <div>
                          <p className='text-sm font-medium text-gray-700 truncate max-w-sx'>
                        {file.name}
                    </p>
                    <p className='text-sm text-gray-500'>
                        {formatSize(file.size)} </p>
                    </div>
                  </div>
                  <button>
                    <img src="/icons/cross.svg" alt="remove" className='w-4' />
                  </button>
                </div>
            ):(
                <div>
                 <div className='mx-auto w-16 h-16 flex items-center justify-center mb-2 '>
                <img src='/icons/info.svg' alt='upload' className='size-20' />
                 </div>
                 <div>
                    <p className='text-lg text-gray-500 '>
                       <span className='font-semibold'>Click To Upload</span> or Drag and Drop
                    </p>
                    <p className='text-lg text-gray-500'>PDF (max {formatSize(20 * 1024 * 1024)})</p>
                </div>
                </div>
            )}
        </div>
      }
    </div>
    </div>
  )
}

export default Fileuploader