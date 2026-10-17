import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {api,post,type User} from './api';
type Context={user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;logout:()=>Promise<void>;reload:()=>Promise<void>;has:(permission:string)=>boolean};
const ctx=createContext<Context|null>(null);
export function AuthProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
 const reload=async()=>{try{const result=await api<User>('/auth/me');setUser(result);}catch{setUser(null);}};
 useEffect(()=>{reload().finally(()=>setLoading(false));const handler=()=>setUser(null);window.addEventListener('worksphere:logout',handler);return()=>window.removeEventListener('worksphere:logout',handler);},[]);
 const login=async(email:string,password:string)=>{const result=await post<{user:User}>('/auth/login',{email,password});setUser(result.user);};
 const logout=async()=>{try{await post('/auth/logout',{});}catch{}setUser(null);};
 const has=(p:string)=>!!user?.permissions.includes('*')||!!user?.permissions.includes(p);
 return <ctx.Provider value={{user,loading,login,logout,reload,has}}>{children}</ctx.Provider>;
}
export const useAuth=()=>{const v=useContext(ctx);if(!v)throw new Error('Missing AuthProvider');return v;};
