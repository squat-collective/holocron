"use client";

import { Input } from "@/components/ui/input";

interface SearchInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

/**
 * Search input with magnifying glass icon.
 */
export function SearchInput({
	value,
	onChange,
	placeholder = "Search for data assets...",
}: SearchInputProps) {
	return (
		<div className="relative">
			<svg
				className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				strokeWidth={2}
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
				/>
			</svg>
			<Input
				type="search"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="pl-10 h-12 text-lg"
			/>
		</div>
	);
}
