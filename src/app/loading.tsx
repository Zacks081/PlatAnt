import Image from "next/image";

/** Lo que se ve mientras una pantalla termina de cargar. */
export default function Loading() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center">
      <Image
        src="/marca/logo-icono.png"
        alt=""
        width={592}
        height={465}
        sizes="96px"
        className="h-auto w-24 animate-pulse"
      />
      <span className="sr-only">Cargando</span>
    </div>
  );
}
