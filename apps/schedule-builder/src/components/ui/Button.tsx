interface props {
  onClick?: () => void;
  className?: string;
  text?: string;
  type?: "submit" | "reset" | "button";
}

export const Button = ({ onClick, className, text, type }: props) => {
  return (
    <button
      className={`bg-red-700 rounded-lg px-4 py-2 font-semibold ${className}`}
      onClick={(e) => {
        if (type === "button") {
          e.preventDefault();
        }
        if (onClick) {
          onClick();
        }
      }}
      type={type}
    >
      {text}
    </button>
  );
};
