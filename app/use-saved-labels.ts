'use client';
import {useCallback,useEffect,useState} from 'react';
import {readSavedLabels,validSavedLabels,writeSavedLabels} from '../lib/saved-labels';
export function useSavedLabels(key:string,options:readonly string[],maxLength?:number){
  const [values,setValues]=useState<string[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{try{setValues(readSavedLabels(localStorage,key,options));}catch{setError('Label preferences could not be read in this browser.');}setReady(true);},[key,options]);
  const save=useCallback((next:string[])=>{const clean=validSavedLabels(next,options);if(maxLength&&clean.join(',').length>maxLength){setError('Choose fewer labels. Remove a selected label before adding another.');return;}setValues(clean);try{writeSavedLabels(localStorage,key,clean,options);setError('');}catch{setError('These labels apply for this visit, but could not be saved in this browser.');}},[key,options,maxLength]);
  return {values,ready,save,error};
}
