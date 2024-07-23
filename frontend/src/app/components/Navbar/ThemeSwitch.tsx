import { useTheme } from "@/app/contexts/ThemeContext";
import { Switch } from "@nextui-org/react";
import { SunIcon } from "../Images/SunIcon";
import { MoonIcon } from "../Images/MoonIcon";

export const ThemeSwitch = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Switch
      defaultSelected={theme === "dark"}
      size="md"
      color="primary"
      startContent={<SunIcon />}
      endContent={theme === "light" && <MoonIcon />}
      onClick={toggleTheme}
    />
  );
};
