import { Button } from "./ui/button";
import {
    ClerkProvider,
    SignInButton,
    SignUpButton,
    SignedIn,
    SignedOut,
    UserButton,
} from '@clerk/nextjs'

export function Appbar() {
  return (
    <div className="flex justify-between px-18 py-1 z-50 max-sm:px-2">
      <div className="text-3xl italic font-semibold text-white/85">Bolty</div>
      <div className="flex gap-4">
        <SignedOut>
           <Button  variant={"default"} className="cursor-pointer">
           <SignInButton />
           </Button>
           <Button variant={"outline"} className="cursor-pointer">
           <SignUpButton />
           </Button>
        </SignedOut>
        <SignedIn>
            <UserButton />
        </SignedIn>
      </div>
    </div>
  );
}
