"use client";
import { Navbar, NavbarBrand, NavbarContent } from "@nextui-org/navbar";
import { Link } from "@nextui-org/react";
import Image from "next/image";
import { ThemeSwitch } from "./ThemeSwitch";

export const NavbarSoloStacking = () => {
  return (
    <Navbar className="p-0 m-0">
      <div className="w-full flex justify-center items-center">
        <div className="flex items-center space-x-4">
          <Link color="foreground" href="/">
            <Image
              src="/stacks-logo.png"
              alt="Automation of Stacker Delegation"
              priority
              width={30}
              height={30}
            />
          </Link>
          <NavbarContent>
            <NavbarBrand>
              <Link color="foreground" href="/">
                <p className="text-xl font-extrabold text-inherit">
                  Automation of Stacker Delegation
                </p>
              </Link>
            </NavbarBrand>
            <ThemeSwitch />
          </NavbarContent>
          <Link color="foreground" href="/">
            <Image
              src="/stacks-logo.png"
              alt="Automation of Stacker Delegation"
              priority
              width={30}
              height={30}
            />
          </Link>
        </div>
      </div>
    </Navbar>
  );
};
