import { appConfig } from "@/config/app";

type WordmarkProps = {
  className?: string;
};

/** El nombre de la app escrito: "Plat" en blanco y "Ant" en verde. */
export function Wordmark({ className = "" }: WordmarkProps) {
  return (
    <span className={`font-display font-bold tracking-[-0.01em] ${className}`}>
      {appConfig.name.first}
      <span className="text-primary">{appConfig.name.second}</span>
    </span>
  );
}
