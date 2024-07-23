"use client";
import { AuthContext } from "@/app/contexts/AuthContext";
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@nextui-org/react";
import { useContext, useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/app/contexts/ThemeContext";
import { ThemeSwitch } from "./ThemeSwitch";

export const HamburgerDropdown = () => {
  const { isAuthenticated, logout } = useContext(AuthContext);
  const { theme } = useTheme();
  const [render, setRender] = useState(false);

  useEffect(() => {
    setRender(true);
  }, []);

  return (
    <Dropdown
      closeOnSelect={false}
      className="rounded-lg border-2 border-[#f5f5f5]"
    >
      <DropdownTrigger>
        <Image
          src="/hamburger.png"
          className={render && theme === "dark" ? "invert" : "invert-0"}
          alt="hamburger"
          width={30}
          height={30}
        />
      </DropdownTrigger>
      <DropdownMenu>
        <DropdownItem key="theme">
          <ThemeSwitch />
        </DropdownItem>
        {isAuthenticated() ? (
          <DropdownItem key="divider">
            <Divider className="bg-[#f5f5f5] h-[2px]" />
          </DropdownItem>
        ) : (
          <DropdownItem />
        )}
        {isAuthenticated() ? (
          <DropdownItem
            key="logout"
            className="text-center"
            onClick={() => logout()}
          >
            Logout
          </DropdownItem>
        ) : (
          <DropdownItem />
        )}
      </DropdownMenu>
    </Dropdown>
  );
};
